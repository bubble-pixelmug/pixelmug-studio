# G-sensor 倾斜水平仪示例。
# 启动时保持水杯竖直、屏幕面向用户；程序记录初始姿态作为中心位置。
# 随后缓慢倾斜水杯，白色气泡会根据 X/Y 两轴的重力投影移动并停留。
# 该示例展示 get_accel() 对静态倾斜的响应，与 motion-show-axis 的平移惯性不同。

import time
import g_sensor
import micropyxel as upyxel


FPS = 30
BASELINE_SAMPLES = 40
BUBBLE_RADIUS = 1
BUBBLE_COLOR = 7
BORDER_COLOR = 12
X_GAIN = 13.0
Y_GAIN = 7.0


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
                return g_sensor.get_accel()
            except RuntimeError:
                pass
        time.sleep_ms(20)
    raise RuntimeError("g_sensor not ready")


def measure_baseline():
    sx = sy = sz = 0.0
    print("保持水杯竖直且静止，正在记录水平仪中心……")
    for _ in range(BASELINE_SAMPLES):
        ax, ay, az = g_sensor.get_accel()
        sx += ax
        sy += ay
        sz += az
        time.sleep_ms(20)
    scale = 1.0 / BASELINE_SAMPLES
    return sx * scale, sy * scale, sz * scale


def main():
    display_ready = False
    try:
        wait_until_ready()
        base_x, base_y, _ = measure_baseline()
        upyxel.init(start_audio=False)
        display_ready = True

        center_x = (upyxel.width - 1) / 2
        center_y = (upyxel.height - 1) / 2
        bubble_x = center_x
        bubble_y = center_y

        def update(rt):
            nonlocal bubble_x, bubble_y
            ax, ay, _ = g_sensor.get_accel()
            target_x = center_x + (ax - base_x) * X_GAIN
            target_y = center_y + (ay - base_y) * Y_GAIN
            target_x = clamp(target_x, 1, rt.width - 2)
            target_y = clamp(target_y, 1, rt.height - 2)
            bubble_x += (target_x - bubble_x) * 0.28
            bubble_y += (target_y - bubble_y) * 0.28

        def draw(rt):
            rt.cls(0)
            rt.line(int(center_x), 1, int(center_x), rt.height - 2, 5)
            rt.line(1, int(center_y), rt.width - 2, int(center_y), 5)
            rt.circ(int(bubble_x + 0.5), int(bubble_y + 0.5), BUBBLE_RADIUS, BUBBLE_COLOR)
            rt.rectb(0, 0, rt.width, rt.height, BORDER_COLOR)

        print("倾斜水平仪开始：缓慢向不同方向倾斜水杯")
        upyxel.run(update, draw, fps=FPS)
    finally:
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()