# MicroPyxel 入门示例：先显示两行静态文字，再让长文字从右向左滚动。
# 展示 API：text、cls、run、quit、destroy。
# 内置字体每个字符占 4×6 像素，支持字符码 32..127；本例只使用英文、数字和空格。
# text 不会自动换行、缩放或滚动；滚动效果通过每帧改变 x 坐标实现。
# 前 3 秒显示静态文字，随后滚动约 12 秒；长文字完全移出左侧后从右侧重新进入。

import micropyxel as upyxel


FPS = 20
STATIC_FRAMES = FPS * 3
TOTAL_FRAMES = FPS * 15
MESSAGE = "PIXELMUG STUDIO"
FONT_WIDTH = 4


def main():
    upyxel.init(start_audio=False)
    try:
        scroll_x = upyxel.width

        def update(rt):
            nonlocal scroll_x
            if rt.frame_count >= STATIC_FRAMES:
                # 每两帧向左移动 1 像素，让小屏幕上的文字更容易看清。
                if (rt.frame_count - STATIC_FRAMES) % 2 == 0:
                    scroll_x -= 1
                if scroll_x < -len(MESSAGE) * FONT_WIDTH:
                    scroll_x = rt.width
            if rt.frame_count >= TOTAL_FRAMES:
                rt.quit()

        def draw(rt):
            rt.cls(0)
            if rt.frame_count < STATIC_FRAMES:
                rt.text(6, 1, "HELLO", 10)
                rt.text(8, 9, "MUG!", 11)
            else:
                rt.text(scroll_x, 5, MESSAGE, 10)

        print("文字演示开始：静态文字后切换为滚动文字")
        upyxel.run(update, draw, fps=FPS)
        print("文字演示结束")
    finally:
        upyxel.destroy()


main()
