# G-sensor 与屏幕交互示例：移动水杯，观察屏幕中央实心圆的惯性反馈。
# 使用姿态：右手持握水杯，屏幕面向用户，并尽量保持杯体竖直。
#
# 坐标映射：
# - 水杯向左移动时，圆因惯性向屏幕右侧移动；向右移动时相反。
# - 水杯向下移动时，圆因惯性向屏幕上方移动；向上移动时相反。
# - 水杯向前靠近用户时，圆变小；向后远离用户时，圆变大。
#
# 左右方向会保证整个圆留在屏幕内。上下方向只限制圆心，允许最多约一半
# 的圆超出屏幕。圆的直径限制在 2 至 8 像素。
# 屏幕四周绘制 32×16 白色边框，实心圆使用默认调色板中的紫色。
# 展示 API：g_sensor.get_accel()、micropyxel.run()、elli()、rectb()。

import time
import g_sensor
import micropyxel as upyxel


FPS = 30
SAMPLE_INTERVAL_MS = 20
BASELINE_SAMPLES = 40

MIN_DIAMETER = 2.0
MAX_DIAMETER = 8.0
DEFAULT_DIAMETER = 5.0

MOTION_DEAD_ZONE = 0.012
BASELINE_TRACK_RATE = 0.025
POSITION_ACCEL = 0.80
SIZE_ACCEL = 0.24
VELOCITY_DAMPING = 0.92
SIZE_DAMPING = 0.90
POSITION_RETURN = 0.008
SIZE_RETURN = 0.015
IDLE_POSITION_RETURN = 0.035
IDLE_SIZE_RETURN = 0.045
MAX_POSITION_SPEED = 1.8
MAX_SIZE_SPEED = 0.35
BALL_COLOR = 2
BORDER_COLOR = 7


def clamp(value, minimum, maximum):
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def remove_dead_zone(value):
    if value > MOTION_DEAD_ZONE:
        return value - MOTION_DEAD_ZONE
    if value < -MOTION_DEAD_ZONE:
        return value + MOTION_DEAD_ZONE
    return 0.0


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
    sx = 0.0
    sy = 0.0
    sz = 0.0

    print("请保持水杯竖直且静止，正在记录 G-sensor 基线……")
    for _ in range(BASELINE_SAMPLES):
        ax, ay, az = g_sensor.get_accel()
        sx += ax
        sy += ay
        sz += az
        time.sleep_ms(SAMPLE_INTERVAL_MS)

    scale = 1.0 / BASELINE_SAMPLES
    baseline = sx * scale, sy * scale, sz * scale
    print(
        "基线：x={:.3f}, y={:.3f}, z={:.3f}".format(
            baseline[0], baseline[1], baseline[2]
        )
    )
    return baseline


def main():
    display_ready = False

    try:
        wait_until_ready()
        baseline_x, baseline_y, baseline_z = measure_baseline()

        upyxel.init(start_audio=False)
        display_ready = True

        center_x = (upyxel.width - 1) / 2
        center_y = (upyxel.height - 1) / 2

        x = center_x
        y = center_y
        diameter = DEFAULT_DIAMETER
        velocity_x = 0.0
        velocity_y = 0.0
        size_velocity = 0.0
        filtered_x = 0.0
        filtered_y = 0.0
        filtered_z = 0.0

        def update(rt):
            nonlocal x, y, diameter
            nonlocal velocity_x, velocity_y, size_velocity
            nonlocal filtered_x, filtered_y, filtered_z
            nonlocal baseline_x, baseline_y, baseline_z

            ax, ay, az = g_sensor.get_accel()

            # 持续缓慢跟踪静态重力分量。手持角度造成的长期偏置会被吸收，
            # 短时间的平移动作仍会作为动态加速度保留下来。
            baseline_x += (ax - baseline_x) * BASELINE_TRACK_RATE
            baseline_y += (ay - baseline_y) * BASELINE_TRACK_RATE
            baseline_z += (az - baseline_z) * BASELINE_TRACK_RATE

            dynamic_x = remove_dead_zone(ax - baseline_x)
            dynamic_y = remove_dead_zone(ay - baseline_y)
            dynamic_z = remove_dead_zone(az - baseline_z)

            # 轻度低通滤波，保留移动响应并抑制单帧噪声。
            filtered_x = filtered_x * 0.55 + dynamic_x * 0.45
            filtered_y = filtered_y * 0.55 + dynamic_y * 0.45
            filtered_z = filtered_z * 0.55 + dynamic_z * 0.45

            # G-sensor +X 指向用户左侧。水杯向左加速时 ax 为正，
            # 圆作为虚拟惯性物体向屏幕右侧移动，因此直接使用 +ax。
            velocity_x += filtered_x * POSITION_ACCEL

            # G-sensor +Z 向上。水杯向下加速时 az 为负，圆向屏幕上方移动。
            velocity_y += filtered_z * POSITION_ACCEL

            # G-sensor +Y 朝向用户。向前靠近用户时 ay 为正，圆缩小。
            size_velocity -= filtered_y * SIZE_ACCEL

            # 没有动态输入时加强回中；检测到动作时减弱回中，保留惯性行程。
            moving = dynamic_x != 0.0 or dynamic_y != 0.0 or dynamic_z != 0.0
            position_return = POSITION_RETURN if moving else IDLE_POSITION_RETURN
            size_return = SIZE_RETURN if moving else IDLE_SIZE_RETURN
            velocity_x += (center_x - x) * position_return
            velocity_y += (center_y - y) * position_return
            size_velocity += (DEFAULT_DIAMETER - diameter) * size_return

            velocity_x *= VELOCITY_DAMPING
            velocity_y *= VELOCITY_DAMPING
            size_velocity *= SIZE_DAMPING

            # 提高灵敏度后限制最大变化速度，避免快速挥动时画面突然跳变。
            velocity_x = clamp(
                velocity_x, -MAX_POSITION_SPEED, MAX_POSITION_SPEED
            )
            velocity_y = clamp(
                velocity_y, -MAX_POSITION_SPEED, MAX_POSITION_SPEED
            )
            size_velocity = clamp(
                size_velocity, -MAX_SIZE_SPEED, MAX_SIZE_SPEED
            )

            x += velocity_x
            y += velocity_y
            diameter += size_velocity
            diameter = clamp(diameter, MIN_DIAMETER, MAX_DIAMETER)

            # 左右边界挡住整个圆。
            half = diameter / 2
            min_x = half
            max_x = rt.width - half
            if x < min_x:
                x = min_x
                velocity_x = 0.0
            elif x > max_x:
                x = max_x
                velocity_x = 0.0

            # 上下只限制圆心，因此圆可以有一部分超出屏幕。
            if y < 0:
                y = 0.0
                velocity_y = 0.0
            elif y > rt.height - 1:
                y = rt.height - 1
                velocity_y = 0.0

            if diameter <= MIN_DIAMETER and size_velocity < 0:
                size_velocity = 0.0
            elif diameter >= MAX_DIAMETER and size_velocity > 0:
                size_velocity = 0.0

        def draw(rt):
            rt.cls(0)
            size = int(diameter + 0.5)
            size = int(clamp(size, int(MIN_DIAMETER), int(MAX_DIAMETER)))
            left = int(x - size / 2)
            top = int(y - size / 2)
            rt.elli(left, top, size, size, BALL_COLOR)
            # 最后绘制边框，让圆到达边缘时呈现被边框挡住的效果。
            rt.rectb(0, 0, rt.width, rt.height, BORDER_COLOR)

        print("运动交互开始：左右、上下、前后移动水杯观察实心圆")
        upyxel.run(update, draw, fps=FPS)
    finally:
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()