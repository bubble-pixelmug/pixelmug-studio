"""Dust 基础示例：一排小球只受模拟重力作用，并在底部弹跳。"""

import micropyxel as upyxel
import pixel_dust


WIDTH = 32
HEIGHT = 16
CAPACITY = 12
SCALE = 8 # scale 提高重力效果
ELASTICITY = 210 # elasticity 提高反弹效果。

dust = pixel_dust.PixelDust(WIDTH, HEIGHT, CAPACITY, SCALE, ELASTICITY)
dust.set_bound_mode(pixel_dust.PixelDust.BOUND_BOUNCE)
# dust.set_bound_mode(pixel_dust.PixelDust.BOUND_CLAMP) # 也可以尝试 BOUND_CLAMP 模式，粒子会在底部停下。
snapshot = bytearray(CAPACITY * 4)


# 只设置一次很小的初始差异；进入模拟后不再施加横向力。
BALLS = (
    (2, 0, -18),
    (5, 1, 10),
    (8, 0, 24),
    (11, 1, -8),
    (14, 0, 16),
    (17, 1, -12),
    (20, 0, 8),
    (23, 1, -22),
    (26, 0, 14),
    (29, 1, -6),
)


def seed_particles():
    """在顶部放置一排间距和初始横向速度略有差异的小球。"""
    for index, (x, y, vx) in enumerate(BALLS):
        dust.spawn(x, y, vx, 0, 8 + (index % 8))


def update(_rt):
    # 运行过程中只有向下的重力，没有横向加速度。
    dust.iterate(0.0, 0.35 * 32, 0.0)


def draw(rt):
    rt.cls(1)    

    # 每个粒子占 4 个字节：[id, x, y, color]。
    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        rt.pset(snapshot[offset + 1], snapshot[offset + 2], snapshot[offset + 3])


def main():
    seed_particles()
    upyxel.init(start_audio=False)
    try:
        upyxel.run(update, draw, fps=20)
    finally:
        dust.deinit()
        upyxel.destroy()


main()
