# Network UDP Motion 示例：把 PixelMug 的融合四元数实时发送给配套 3D 查看器。
# 展示 API：g_sensor.get_quaternion、socket.getaddrinfo、UDP sendto 和 socket.close。
# 先启动 network-udp-motion-viewer，再把 HOST_IP 改为上位机输出的局域网地址。
# 设备约每 40 ms 采样并发送一包；UDP 不保证到达，查看器按序号统计丢帧。
import gc
import json
import socket
import time

import g_sensor


HOST_IP = "172.16.30.186"
HOST_PORT = 9000
SEND_INTERVAL_MS = 40
READY_TIMEOUT_MS = 5000
ENOMEM = 12
ENOMEM_RETRY_MS = 20
ENOMEM_LOG_INTERVAL = 20
STATS_INTERVAL_MS = 1000


def wait_until_ready():
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")

    deadline = time.ticks_add(time.ticks_ms(), READY_TIMEOUT_MS)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if g_sensor.is_ready() == g_sensor.STATUS_OK:
            try:
                return g_sensor.get_quaternion()
            except RuntimeError:
                pass
        time.sleep_ms(20)

    raise RuntimeError("g_sensor not ready")


def main():
    sock = None
    try:
        first_quaternion = wait_until_ready()
        address_info = socket.getaddrinfo(
            HOST_IP,
            HOST_PORT,
            0,
            socket.SOCK_DGRAM,
        )[0]
        family, sock_type, protocol, _, address = address_info
        sock = socket.socket(family, sock_type, protocol)

        print("UDP motion target:", address)
        print("First quaternion (x, y, z, w):", first_quaternion)
        print("Sending quaternion at about", 1000 // SEND_INTERVAL_MS, "Hz")

        sequence = 0
        enomem_count = 0
        stats_started_ms = time.ticks_ms()
        sampled_count = 0
        sent_count = 0
        enomem_window_count = 0
        max_send_ms = 0
        max_loop_ms = 0

        while True:
            loop_started_ms = time.ticks_ms()
            qx, qy, qz, qw = g_sensor.get_quaternion()
            sampled_count += 1
            packet = json.dumps({
                "v": 2,
                "seq": sequence,
                "t": time.ticks_ms(),
                "q": [qx, qy, qz, qw],
            }).encode()

            sequence = (sequence + 1) & 0x7FFFFFFF
            send_succeeded = True
            send_started_ms = time.ticks_ms()
            try:
                sock.sendto(packet, address)
                sent_count += 1
            except OSError as exc:
                if not exc.args or exc.args[0] != ENOMEM:
                    raise

                send_succeeded = False
                enomem_count += 1
                enomem_window_count += 1
                if enomem_count == 1 or enomem_count % ENOMEM_LOG_INTERVAL == 0:
                    print("UDP buffer busy; dropped frames:", enomem_count)

            send_elapsed_ms = time.ticks_diff(time.ticks_ms(), send_started_ms)
            if send_elapsed_ms > max_send_ms:
                max_send_ms = send_elapsed_ms

            now_ms = time.ticks_ms()
            loop_elapsed_ms = time.ticks_diff(now_ms, loop_started_ms)
            if loop_elapsed_ms > max_loop_ms:
                max_loop_ms = loop_elapsed_ms

            stats_elapsed_ms = time.ticks_diff(now_ms, stats_started_ms)
            if stats_elapsed_ms >= STATS_INTERVAL_MS:
                heap_free_before_gc = gc.mem_free()
                gc.collect()
                heap_free_after_gc = gc.mem_free()
                # print(
                #     "UDP stats | window_ms:", stats_elapsed_ms,
                #     "sampled:", sampled_count,
                #     "sent:", sent_count,
                #     "ENOMEM:", enomem_window_count,
                #     "total_ENOMEM:", enomem_count,
                #     "send_max_ms:", max_send_ms,
                #     "loop_max_ms:", max_loop_ms,
                #     "heap_free:", heap_free_after_gc,
                #     "gc_reclaimed:", heap_free_after_gc - heap_free_before_gc,
                #     "heap_alloc:", gc.mem_alloc(),
                # )
                stats_started_ms = now_ms
                sampled_count = 0
                sent_count = 0
                enomem_window_count = 0
                max_send_ms = 0
                max_loop_ms = 0

            time.sleep_ms(SEND_INTERVAL_MS if send_succeeded else ENOMEM_RETRY_MS)
    finally:
        if sock is not None:
            sock.close()
        g_sensor.deinit()


main()