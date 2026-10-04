# Network TCP 示例：使用原始 Socket 请求 example.com，并读取 HTTP 响应。
# 展示 API：getaddrinfo、socket、settimeout、connect、sendall、recv 和 close。
# HTTP 只作为稳定的 TCP 测试协议；实际 HTTP 业务应使用 requests。
# TCP 不保留消息边界，因此状态行可能跨越多个 recv 数据块。

import socket
import time

import micropyxel as upyxel


HOST = "example.com"
PORT = 80
RECV_SIZE = 512
STATUS_LINE_LIMIT = 128
STEP_DELAY_SECONDS = 1.5

REQUEST = (
    "GET / HTTP/1.0\r\n"
    "Host: example.com\r\n"
    "Connection: close\r\n"
    "\r\n"
).encode()


def draw_status(text, color):
    title = "TCP TEST"
    upyxel.cls(0)
    upyxel.text((upyxel.width - len(title) * 4) // 2, 1, title, 7)
    upyxel.text(max(0, (upyxel.width - len(text) * 4) // 2), 9, text, color)
    upyxel.render_graphics()


def show_step(text):
    draw_status(text, 10)
    time.sleep(STEP_DELAY_SECONDS)


def read_response(sock):
    total_bytes = 0
    status_buffer = bytearray()

    while True:
        data = sock.recv(RECV_SIZE)
        if not data:
            break

        total_bytes += len(data)

        if status_buffer.find(b"\r\n") < 0 and len(status_buffer) < STATUS_LINE_LIMIT:
            remaining = STATUS_LINE_LIMIT - len(status_buffer)
            status_buffer.extend(data[:remaining])

    line_end = status_buffer.find(b"\r\n")
    if line_end < 0:
        raise ValueError("response has no complete status line")

    status_line = bytes(status_buffer[:line_end]).decode()
    fields = status_line.split(" ", 2)
    if len(fields) < 2 or not fields[0].startswith("HTTP/"):
        raise ValueError("invalid HTTP status line: " + status_line)

    return int(fields[1]), status_line, total_bytes


def run_client():
    sock = None

    show_step("RESOLVE")
    address_info = socket.getaddrinfo(
        HOST,
        PORT,
        0,
        socket.SOCK_STREAM,
    )[0]
    family, sock_type, protocol, _, address = address_info
    print("Resolved address:", address)

    try:
        sock = socket.socket(family, sock_type, protocol)
        sock.settimeout(10)

        show_step("CONNECT")
        sock.connect(address)
        print("Connected")

        show_step("SEND")
        sock.sendall(REQUEST)

        show_step("RECV")
        status_code, status_line, total_bytes = read_response(sock)
        print("Status line:", status_line)
        print("Received bytes:", total_bytes)

        if status_code != 200:
            raise RuntimeError("HTTP status {}".format(status_code))

        return status_code
    finally:
        if sock is not None:
            sock.close()
            print("Socket closed")


def main():
    upyxel.init(start_audio=False)
    try:
        try:
            status_code = run_client()
        except Exception as exc:
            print("TCP test failed:", repr(exc))
            draw_status("ERROR", 8)
            time.sleep(3)
            raise

        draw_status("{} OK".format(status_code), 11)
        time.sleep(3)
    finally:
        upyxel.destroy()


main()