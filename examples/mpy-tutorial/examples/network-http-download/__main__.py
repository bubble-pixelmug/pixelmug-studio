# Network HTTP 下载示例：通过 HTTPS 流式下载 64 KiB 文件并保存到设备。
# 展示 API：response.raw.readinto、固定缓冲区写文件以及 response.close。
# 整个响应不会一次载入 MicroPython 堆；每次最多读取 1 KiB。
# 下载完成后同时校验累计字节数和 download.bin 的实际文件大小。

import os
import time

import micropyxel as upyxel
import requests


DOWNLOAD_SIZE = 65536
BUFFER_SIZE = 1024
FILE_PATH = "download.bin"
URL = "https://speed.cloudflare.com/__down?bytes={}".format(DOWNLOAD_SIZE)


def draw_status(text, color):
    title = "DOWNLOAD"
    upyxel.cls(0)
    upyxel.text((upyxel.width - len(title) * 4) // 2, 1, title, 7)
    upyxel.text(max(0, (upyxel.width - len(text) * 4) // 2), 9, text, color)
    upyxel.render_graphics()


def download():
    response = None
    downloaded = 0
    last_percent = -1
    buffer = bytearray(BUFFER_SIZE)
    started_ms = time.ticks_ms()

    try:
        response = requests.get(URL, timeout=15)
        if response.status_code != 200:
            raise RuntimeError("HTTP status {}".format(response.status_code))

        with open(FILE_PATH, "wb") as output:
            while True:
                size = response.raw.readinto(buffer)
                if not size:
                    break

                output.write(memoryview(buffer)[:size])
                downloaded += size

                percent = min(100, downloaded * 100 // DOWNLOAD_SIZE)
                if percent != last_percent:
                    draw_status("{}%".format(percent), 10)
                    last_percent = percent
    finally:
        if response is not None:
            response.close()

    elapsed_ms = time.ticks_diff(time.ticks_ms(), started_ms)
    file_size = os.stat(FILE_PATH)[6]

    print("Downloaded bytes:", downloaded)
    print("Saved file size:", file_size)
    print("Elapsed time:", elapsed_ms, "ms")

    if downloaded != DOWNLOAD_SIZE or file_size != DOWNLOAD_SIZE:
        raise RuntimeError(
            "size mismatch: downloaded={}, file={}".format(downloaded, file_size)
        )


def main():
    upyxel.init(start_audio=False)
    try:
        draw_status("0%", 10)
        try:
            download()
        except Exception as exc:
            print("Download failed:", repr(exc))
            draw_status("ERROR", 8)
            time.sleep(3)
            raise

        print("Download complete:", FILE_PATH)
        draw_status("DONE", 11)
        time.sleep(3)
    finally:
        upyxel.destroy()


main()