# G-sensor 三轴角速度示例。
# X、Y、Z 三个轴分别显示在三页中；单击 PixelMug 底部触摸区域切换页面。
# 每页中线右侧表示正角速度，左侧表示负角速度，色条长度表示角速度大小。
# 采用较强的平滑滤波和 500°/s 显示量程，让动效变化更缓慢、稳定。
# 展示 API：get_gyro()；返回单位为度每秒（°/s）。

import time
import g_sensor
import micropyxel as upyxel
import mpy_button


FPS = 30
MAX_DISPLAY_DPS = 25.0
DISPLAY_SMOOTHING = 0.12
BAR_CENTER = 16
BAR_Y = 7
BAR_HEIGHT = 3
BAR_MAX_LENGTH = 10
AXIS_NAMES = ("X", "Y", "Z")
AXIS_COLORS = (8, 10, 12)


def clamp(value, minimum, maximum):
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if g_sensor.is_ready() == g_sensor.STATUS_OK:
            try:
                return g_sensor.get_gyro()
            except RuntimeError:
                pass
        time.sleep_ms(20)
    raise RuntimeError("g_sensor not ready")


def main():
    display_ready = False
    try:
        wait_until_ready()
        upyxel.init(start_audio=False)
        display_ready = True
        mpy_button.clear()

        values = [0.0, 0.0, 0.0]
        page = 0

        def update(rt):
            nonlocal page

            # 取完当前积压的触摸事件。每次 click 切换到下一个轴。
            while True:
                button_event = mpy_button.get()
                if button_event is None:
                    break
                if button_event == "click":
                    page = (page + 1) % 3
                    print("当前显示 {} 轴角速度".format(AXIS_NAMES[page]))

            gx, gy, gz = g_sensor.get_gyro()
            samples = (gx, gy, gz)
            for index in range(3):
                values[index] += (
                    samples[index] - values[index]
                ) * DISPLAY_SMOOTHING

        def draw(rt):
            rt.cls(0)
            name = AXIS_NAMES[page]
            color = AXIS_COLORS[page]
            value = values[page]

            label_x = (rt.width - rt.DEFAULT_FONT_WIDTH) // 2
            rt.text(label_x, 0, name, color)

            # 中线是零点；正角速度向右，负角速度向左。
            rt.line(BAR_CENTER, 5, BAR_CENTER, 12, 7)
            length = int(
                clamp(value / MAX_DISPLAY_DPS, -1.0, 1.0)
                * BAR_MAX_LENGTH
            )
            if length > 0:
                rt.rect(BAR_CENTER, BAR_Y, length, BAR_HEIGHT, color)
            elif length < 0:
                rt.rect(
                    BAR_CENTER + length,
                    BAR_Y,
                    -length,
                    BAR_HEIGHT,
                    color,
                )

            # 底部三个点表示页码，当前轴对应的点使用轴颜色。
            for index in range(3):
                dot_color = color if index == page else 5
                rt.pset(14 + index * 2, 14, dot_color)

        print("三轴角速度显示开始：当前显示 X 轴")
        print("单击底部触摸区域，在 X、Y、Z 页面之间切换")
        upyxel.run(update, draw, fps=FPS)
    finally:
        mpy_button.clear()
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()