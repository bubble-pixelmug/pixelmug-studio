"""Receive PixelMug UDP palette and 4-bit frame packets.

The host sends palette updates and packed 32x16 frames over UDP.  This
example validates packet headers, keeps a small frame queue, and renders the
newest available frame with micropyxel.
"""

import errno
import socket

import micropyxel as upyxel


UDP_PORT = 9001
FPS = 30
WIDTH = 32
HEIGHT = 16
PIXEL_COUNT = WIDTH * HEIGHT
PACKED_FRAME_BYTES = PIXEL_COUNT // 2

PALETTE_MAGIC = b"PMUP"
FRAME_MAGIC = b"PMUF"
PROTOCOL_VERSION = 1

PALETTE_HEADER_BYTES = 8
FRAME_HEADER_BYTES = 12
MAX_PACKET_BYTES = 640
MAX_PACKETS_PER_UPDATE = 16
FRAME_QUEUE_CAPACITY = 6

WOULD_BLOCK_ERRORS = (
    getattr(errno, "EAGAIN", 11),
    getattr(errno, "EWOULDBLOCK", 11),
    116,
)


def sequence_is_newer(sequence, previous):
    if previous < 0:
        return True

    difference = (sequence - previous) & 0xFFFF
    return 0 < difference < 0x8000


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    try:
        try:
            sock.setsockopt(
                socket.SOL_SOCKET,
                socket.SO_REUSEADDR,
                1,
            )
        except OSError:
            pass

        sock.bind(("0.0.0.0", UDP_PORT))
        sock.setblocking(False)

        upyxel.init(start_audio=False)

        frame_queue = [bytearray(PACKED_FRAME_BYTES)
                       for _ in range(FRAME_QUEUE_CAPACITY)]
        queue_head = 0
        queue_tail = 0
        queue_count = 0

        current_palette_id = -1
        last_sequence = -1
        has_frame = False
        last_sender = None

        print("UDP cast listening on 0.0.0.0:{}".format(UDP_PORT))
        print("Open host-effect-caster and enter this PixelMug IP")

        def accept_packet(packet, sender):
            nonlocal current_palette_id
            nonlocal last_sequence
            nonlocal has_frame
            nonlocal last_sender
            nonlocal queue_head
            nonlocal queue_tail
            nonlocal queue_count

            # Palette packet
            if (
                len(packet) >= PALETTE_HEADER_BYTES
                and packet[:4] == PALETTE_MAGIC
            ):
                if packet[4] != PROTOCOL_VERSION:
                    return

                color_count = packet[5]
                expected_size = PALETTE_HEADER_BYTES + color_count * 3

                if (
                    color_count < 1
                    or color_count > 16
                    or len(packet) != expected_size
                ):
                    return

                palette_id = (packet[6] << 8) | packet[7]

                colors = []
                offset = PALETTE_HEADER_BYTES

                for _ in range(color_count):
                    color = (
                        (packet[offset] << 16)
                        | (packet[offset + 1] << 8)
                        | packet[offset + 2]
                    )
                    colors.append(color)
                    offset += 3

                upyxel.set_palette(colors)

                if palette_id != current_palette_id:
                    current_palette_id = palette_id
                    last_sequence = -1
                    has_frame = False
                    queue_head = 0
                    queue_tail = 0
                    queue_count = 0

                if sender != last_sender:
                    last_sender = sender
                    print("Receiving UDP cast from", sender)

                return

            # Frame packet
            expected_frame_size = FRAME_HEADER_BYTES + PACKED_FRAME_BYTES

            if len(packet) != expected_frame_size:
                return

            if packet[:4] != FRAME_MAGIC:
                return

            if packet[4] != PROTOCOL_VERSION:
                return

            if packet[5] != WIDTH or packet[6] != HEIGHT:
                return

            palette_id = (packet[8] << 8) | packet[9]

            # Ignore frames belonging to an unknown palette.
            if palette_id != current_palette_id:
                return

            sequence = (packet[10] << 8) | packet[11]
            # Ignore duplicated or out-of-order frames.
            if not sequence_is_newer(sequence, last_sequence):
                return

            frame_queue[queue_tail][:] = packet[FRAME_HEADER_BYTES:]
            queue_tail = (queue_tail + 1) % FRAME_QUEUE_CAPACITY
            if queue_count >= FRAME_QUEUE_CAPACITY:
                queue_head = (queue_head + 1) % FRAME_QUEUE_CAPACITY
            else:
                queue_count += 1

            last_sequence = sequence
            has_frame = True

        def update(_rt):

            for _ in range(MAX_PACKETS_PER_UPDATE):
                try:
                    packet, sender = sock.recvfrom(MAX_PACKET_BYTES)

                except OSError as error:
                    code = error.args[0] if error.args else None

                    if code in WOULD_BLOCK_ERRORS:
                        break

                    raise

                accept_packet(packet, sender)


        def draw(rt):
            nonlocal queue_head
            nonlocal queue_count

            if not has_frame:
                rt.cls(0)
                rt.text(2, 5, "WAIT UDP", 7)
                return

            # Do not redraw if no new UDP frame has arrived.
            if queue_count <= 0:
                return

            pixel_index = 0

            for packed in frame_queue[queue_head]:
                # First pixel: high nibble
                x = pixel_index & 31
                y = pixel_index >> 5
                rt.pset(x, y, packed >> 4)
                pixel_index += 1

                # Second pixel: low nibble
                x = pixel_index & 31
                y = pixel_index >> 5
                rt.pset(x, y, packed & 0x0F)
                pixel_index += 1

            queue_head = (queue_head + 1) % FRAME_QUEUE_CAPACITY
            queue_count -= 1

        upyxel.run(update, draw, fps=FPS)

    finally:
        sock.close()

        try:
            upyxel.destroy()
        except Exception:
            pass


main()
