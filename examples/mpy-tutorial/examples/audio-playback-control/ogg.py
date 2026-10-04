# Audio Service OGG 播放示例的辅助拆包器：将 Ogg Opus 文件拆成完整 Opus 包。
# 配合 __main__.py 使用；这是示例代码，不是固件内置 API。
# Ogg Opus 拆包逻辑摘自 mps/audio-visualizer/mpy/net_player.py。
SUPPORTED_FRAME_MS_X10 = (200, 400, 600)

def _opus_packet_duration_ms_x10(packet):
    if not packet:
        return 0
    toc = packet[0]
    config = toc >> 3
    code = toc & 3

    if config < 12:
        frame_x10 = (100, 200, 400, 600)[config & 3]
    elif config < 16:
        frame_x10 = (100, 200)[config & 1]
    else:
        frame_x10 = (25, 50, 100, 200)[config & 3]

    if code == 0:
        frames = 1
    elif code == 1 or code == 2:
        frames = 2
    else:
        if len(packet) < 2:
            return 0
        frames = packet[1] & 0x3f
        if frames <= 0:
            return 0
    return frame_x10 * frames


class OggOpusStreamDemuxer:
    def __init__(self, max_header_bytes=65536):
        self.buf = bytearray()
        self.partial = bytearray()
        self.seen_head = False
        self.seen_tags = False
        self.validated = False
        self.error = None
        self.sample_rate = 16000
        self.seen_eos = False
        self.channels = 0
        self.frame_ms = 60
        self._bytes_seen = 0
        self._max_header_bytes = int(max_header_bytes)

    def feed(self, data):
        if self.error:
            return ()
        if data:
            self.buf.extend(data)
            self._bytes_seen += len(data)

        packets = []
        while True:
            if len(self.buf) < 27:
                break

            if self.buf[0:4] != b"OggS":
                pos = self.buf.find(b"OggS")
                if pos < 0:
                    keep = self.buf[-3:] if len(self.buf) > 3 else self.buf
                    self.buf = bytearray(keep)
                    break
                if pos > 0:
                    self.buf = bytearray(self.buf[pos:])
                if len(self.buf) < 27:
                    break

            version = self.buf[4]
            if version != 0:
                self.error = "bad ogg version: %d" % version
                break

            header_type = self.buf[5]
            seg_cnt = self.buf[26]
            page_header_len = 27 + seg_cnt
            if len(self.buf) < page_header_len:
                break

            body_size = 0
            for i in range(seg_cnt):
                body_size += self.buf[27 + i]
            page_size = page_header_len + body_size
            if len(self.buf) < page_size:
                break

            seg_table = self.buf[27:page_header_len]
            body = self.buf[page_header_len:page_size]
            continued = (header_type & 0x01) != 0
            pkt = self.partial if continued and len(self.partial) else bytearray()
            self.partial = bytearray()

            cur = 0
            for l in seg_table:
                if l:
                    pkt.extend(body[cur:cur + l])
                cur += l

                if l < 255:
                    if len(pkt):
                        out = self._handle_packet(pkt)
                        if out is not None:
                            packets.append(out)
                    pkt = bytearray()

            if len(pkt):
                self.partial = pkt

            if header_type & 0x04:
                self.seen_eos = True

            self.buf = bytearray(self.buf[page_size:])

        if (not self.validated and self._bytes_seen > self._max_header_bytes
                and not self.error):
            self.error = "missing opus headers"

        return packets

    def _handle_packet(self, pkt):
        if not self.seen_head:
            if len(pkt) < 19 or pkt[:8] != b"OpusHead":
                self.error = "missing OpusHead: len=%d head=%r" % (len(pkt), pkt[:8])
                return None
            version = pkt[8]
            channels = pkt[9]
            sample_rate = (pkt[12] |
                           (pkt[13] << 8) |
                           (pkt[14] << 16) |
                           (pkt[15] << 24))
            mapping_family = pkt[18]

            if version > 15:
                self.error = "bad opus version: %d" % version
                return None
            # Audio Service renders a mono output stream. Standard
            # mapping-family-0 stereo Opus is downmixed to mono by libopus.
            if channels != 1 and channels != 2:
                self.error = "unsupported channel count: %d" % channels
                return None
            if mapping_family != 0:
                self.error = "unsupported channel mapping: %d" % mapping_family
                return None
            # OpusHead input sample rate is informational. Playback is
            # decoded through Audio Service fixed 48 kHz output path, so do
            # not reject streams based on the recorded source rate.

            self.channels = channels
            self.sample_rate = sample_rate
            self.seen_head = True
            return None

        if not self.seen_tags:
            if len(pkt) < 8 or pkt[:8] != b"OpusTags":
                self.error = "missing OpusTags: len=%d head=%r" % (len(pkt), pkt[:8])
                return None
            self.seen_tags = True
            return None

        if not self.validated:
            duration_x10 = _opus_packet_duration_ms_x10(pkt)
            if duration_x10 not in SUPPORTED_FRAME_MS_X10:
                self.error = "unsupported opus frame duration: %.1fms toc=%d len=%d" % (
                    duration_x10 / 10, pkt[0], len(pkt)
                )
                return None
            self.frame_ms = duration_x10 // 10
            self.validated = True

        return bytes(pkt)
