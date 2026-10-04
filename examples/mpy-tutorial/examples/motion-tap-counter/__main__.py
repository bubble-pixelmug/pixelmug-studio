# G-sensor 放杯计数示例。
# 杯子拿起后重新放到桌面，每收到一次 EVENT_TAP，计数器加一并播放扩散圆环动画。
# EVENT_TAP 来自运动传感器的 Z 轴冲击检测，不是底部触摸区域的 click。
# 当前接口不区分单击、双击或三击类型；固件检测到的敲击统一产生 EVENT_TAP。
# 展示 API：on()、off()、EVENT_TAP、circb()。

import time
import g_sensor
import micropyxel as upyxel


FPS = 30
PULSE_FRAMES = 10


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while g_sensor.is_ready() != g_sensor.STATUS_OK:
        if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
            raise RuntimeError("g_sensor not ready")
        time.sleep_ms(20)


def three_digits(value):
    text = str(value % 1000)
    while len(text) < 3:
        text = "0" + text
    return text


def main():
    display_ready = False
    callback_registered = False
    pending_taps = 0

    def on_tap(events):
        nonlocal pending_taps
        if events & g_sensor.EVENT_TAP:
            pending_taps += 1

    try:
        wait_until_ready()
        upyxel.init(start_audio=False)
        display_ready = True

        if not g_sensor.on(g_sensor.EVENT_TAP, on_tap):
            raise RuntimeError("g_sensor tap callback registration failed")
        callback_registered = True

        count = 0
        pulse = 0

        def update(rt):
            nonlocal pending_taps, count, pulse
            if pending_taps:
                taps = pending_taps
                pending_taps = 0
                count = (count + taps) % 1000
                pulse = PULSE_FRAMES
                print("placement count:", count)
            elif pulse > 0:
                pulse -= 1

        def draw(rt):
            rt.cls(0)
            text = three_digits(count)
            x = (rt.width - len(text) * rt.DEFAULT_FONT_WIDTH) // 2
            y = (rt.height - rt.DEFAULT_FONT_HEIGHT) // 2
            rt.text(x, y, text, 7)
            if pulse > 0:
                radius = 1 + (PULSE_FRAMES - pulse) // 2
                rt.circb(rt.width // 2, rt.height // 2, radius, 8)

        print("计数开始：拿起杯子，然后轻放到桌面")
        upyxel.run(update, draw, fps=FPS)
    finally:
        if callback_registered:
            g_sensor.off(on_tap)
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()
