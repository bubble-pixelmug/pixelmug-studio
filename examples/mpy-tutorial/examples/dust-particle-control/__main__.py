"""Dust 粒子控制示例：单击发射粒子，粒子碰到底部后消失。"""

import random

import micropyxel as upyxel
import mpy_button
import pixel_dust


WIDTH = 32
HEIGHT = 16
CAPACITY = 32
DUST_SCALE = 5
DUST_ELASTICITY = 210
FPS = 30


dust = pixel_dust.PixelDust(WIDTH, HEIGHT, CAPACITY, DUST_SCALE, DUST_ELASTICITY)
dust.set_bound_mode(pixel_dust.PixelDust.BOUND_BOUNCE)
snapshot = bytearray(CAPACITY * 4)


# 屏幕中央的 8x2 障碍物。
for y in range(10, 12):
    for x in range(12, 20):
        dust.set_obstacle(x, y)
for x in range(15, 32):
    dust.set_obstacle(x, 15)


def launch_particle():
    """从左侧发射一个粒子，偶尔在旁边同时发射第二个。"""
    def spawn_one(y):
        vx = random.randint(500, 800)
        vy = random.randint(-100, 100)
        try:
            dust.spawn(0, y, vx, vy, random.randint(8, 15))
        except OSError:
            # 粒子池暂时已满时，等待已有粒子离场后再发射。
            pass

    spawn_one(4)
    if random.randint(0, 3) == 0:
        spawn_one(5)


def remove_bottom_particles():
    """回收已经到达最底行的粒子。"""
    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        if snapshot[offset + 2] >= HEIGHT - 1:
            dust.despawn(snapshot[offset])


def update(_rt):
    while True:
        event = mpy_button.get()
        if event is None:
            break
        if event == "click":
            launch_particle()

    dust.iterate(0.0, 0.35 * 32, 0.0)
    remove_bottom_particles()


def draw(rt):
    rt.cls(0)
    rt.text(8, 2, "shot", 1)

    for y in range(10, 12):
        for x in range(12, 20):
            rt.pset(x, y, 7)
    for x in range(15, 32):
        rt.pset(x, 15, 7)

    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        rt.pset(snapshot[offset + 1], snapshot[offset + 2], snapshot[offset + 3])


def main():
    mpy_button.clear()
    upyxel.init(start_audio=False)
    try:
        upyxel.run(update, draw, fps=FPS)
    finally:
        mpy_button.clear()
        dust.deinit()
        upyxel.destroy()


main()
