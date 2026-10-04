"""Dust 与 G-Sensor：倾斜 PixelMug，让沙粒随重力方向流动。"""

import time

import g_sensor
import micropyxel as upyxel
import pixel_dust


WIDTH = 32
HEIGHT = 16
CAPACITY = 48
DUST_SCALE = 5
DUST_ELASTICITY = 210
FORCE_SCALE = 0.1
FPS = 30


dust = pixel_dust.PixelDust(WIDTH, HEIGHT, CAPACITY, DUST_SCALE, DUST_ELASTICITY)
dust.set_bound_mode(pixel_dust.PixelDust.BOUND_BOUNCE)
snapshot = bytearray(CAPACITY * 4)


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")

    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if g_sensor.is_ready() == g_sensor.STATUS_OK:
            try:
                g_sensor.get_accel()
                return
            except RuntimeError:
                # 初始化完成后，第一份有效快照可能还没有生成。
                pass
        time.sleep_ms(20)

    raise RuntimeError("g_sensor not ready")


def seed_particles():
    """在顶部放置一排彩色沙粒。"""    
    for x in range(2, WIDTH, 2):
        dust.spawn(x, 0, 0, 0, 8 + (x % 8))


def update(_rt):
    try:
        ax, _ay, az = g_sensor.get_accel()
    except RuntimeError:
        # 传感器快照暂时不可用时跳过这一帧，等待下一次更新。
        return

    # 已标定的水杯坐标映射：使用 X、Z 作为屏幕的水平、垂直方向。
    # 传入 az 之前保持第三个参数为 0，使用稳定的二维模拟。
    dust.iterate(ax * 128 * FORCE_SCALE, az * 128 * FORCE_SCALE, 0.0)


def draw(rt):
    rt.cls(0)
    rt.text(8, 4, "DUST", 1) # background text

    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        rt.pset(snapshot[offset + 1], snapshot[offset + 2], snapshot[offset + 3])


def main():
    display_ready = False
    try:
        wait_until_ready()
        seed_particles()
        upyxel.init(start_audio=False)
        display_ready = True
        print("倾斜 PixelMug，让沙粒随 G-sensor 重力方向流动")
        upyxel.run(update, draw, fps=FPS)
    finally:
        dust.deinit()
        if display_ready:
            upyxel.destroy()
        g_sensor.deinit()


main()


