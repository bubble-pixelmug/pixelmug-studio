# MicroPyxel 入门示例：一个白色小球在屏幕内移动，碰到边缘后反弹。
# 展示 API：init、run(update, draw)、cls、circ、quit、destroy。
# update 只更新位置；draw 清屏并绘制；run 在 draw 后自动刷新，无需手动 render_graphics。
# 目标帧率为 20 fps，每帧移动 1 像素；运行约 15 秒后 quit 退出循环，再 destroy 释放资源。
# quit 不负责释放资源，destroy 也不替代退出循环。

import time
import micropyxel as upyxel


RADIUS = 2
DURATION_MS = 15000


def main():
    upyxel.init(start_audio=False)
    try:
        x, y = upyxel.width // 2, upyxel.height // 2
        dx, dy = 1, 1
        started = time.ticks_ms()

        def update(rt):
            nonlocal x, y, dx, dy
            x += dx
            y += dy
            # 圆心与屏幕边缘至少相距一个半径，保证整个小球都在屏幕内。
            if x <= RADIUS or x >= rt.width - 1 - RADIUS:
                dx = -dx
            if y <= RADIUS or y >= rt.height - 1 - RADIUS:
                dy = -dy
            if time.ticks_diff(time.ticks_ms(), started) >= DURATION_MS:
                rt.quit()

        def draw(rt):
            rt.cls(0)  # 清掉上一帧，避免留下运动轨迹。
            rt.circ(x, y, RADIUS, 7)  # 默认调色板：0 为黑色，7 为白色。

        print("小球动画开始，约 15 秒后自动结束")
        upyxel.run(update, draw, fps=20)
        print("动画结束")
    finally:
        upyxel.destroy()


main()
