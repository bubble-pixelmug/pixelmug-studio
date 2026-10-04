# Network HTTP JSON 示例：通过 HTTPS 获取 Chicago 当前温度并显示在屏幕上。
# 展示 API：requests.get、status_code、response.json 和 response.close。
# Open-Meteo 不需要 API Key；正常时每 15 分钟更新，失败后 30 秒重试。
# response.json 会把完整响应载入内存，本例响应很小，适合直接解析。

import time

import micropyxel as upyxel
import requests


CITY = "CHICAGO"
LATITUDE = 41.8781
LONGITUDE = -87.6298
UPDATE_INTERVAL_SECONDS = 15 * 60
RETRY_INTERVAL_SECONDS = 30

URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude={}&longitude={}"
    "&current=temperature_2m"
    "&timezone=auto"
).format(LATITUDE, LONGITUDE)


def draw_status(text, color):
    upyxel.cls(0)
    upyxel.text((upyxel.width - len(CITY) * 4) // 2, 1, CITY, 7)
    upyxel.text(max(0, (upyxel.width - len(text) * 4) // 2), 9, text, color)
    upyxel.render_graphics()


def fetch_temperature():
    response = None
    try:
        response = requests.get(URL, timeout=10)
        if response.status_code != 200:
            raise RuntimeError("HTTP status {}".format(response.status_code))

        payload = response.json()
        current = payload.get("current")
        if not isinstance(current, dict):
            raise ValueError("response has no current weather")

        temperature = current.get("temperature_2m")
        if not isinstance(temperature, (int, float)):
            raise ValueError("response has no temperature_2m")

        print("Chicago current temperature:", temperature, "C")
        print("Weather observation time:", current.get("time"))
        return temperature
    finally:
        if response is not None:
            response.close()


def main():
    upyxel.init(start_audio=False)
    try:
        while True:
            draw_status("FETCH", 10)
            try:
                temperature = fetch_temperature()
                draw_status("{:.1f}C".format(temperature), 11)
                wait_seconds = UPDATE_INTERVAL_SECONDS
            except Exception as exc:
                print("Weather request failed:", repr(exc))
                draw_status("ERROR", 8)
                wait_seconds = RETRY_INTERVAL_SECONDS

            time.sleep(wait_seconds)
    finally:
        upyxel.destroy()


main()