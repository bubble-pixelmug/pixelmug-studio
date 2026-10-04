# MicroPyxel 入门示例：分三页展示屏幕缓冲区的基础图形接口。
# 第 1 页：像素、线、实心矩形和矩形边框。
# 第 2 页：实心圆、圆形边框、实心椭圆和椭圆边框。
# 第 3 页：实心三角形、三角形边框，以及在封闭区域内使用 fill。
# 展示 API：pset、line、rect、rectb、circ、circb、elli、ellib、tri、trib、fill。
# 每页显示约 2 秒，全部页面重复两轮后退出；run 会在每次 draw 后自动刷新屏幕。
# 图形坐标可以超出屏幕，超出的部分会被裁掉；颜色参数是调色板索引。

import micropyxel as upyxel


FPS = 20
PAGE_FRAMES = FPS * 2
PAGE_COUNT = 3
REPEATS = 2


def draw_lines_and_rectangles(rt):
    # 左侧展示像素和交叉线。
    rt.line(0, 0, 13, 15, 8)
    rt.line(0, 15, 13, 0, 9)
    rt.pset(6, 7, 7)
    rt.pset(7, 8, 7)

    # 右侧分别展示实心矩形和矩形边框。
    rt.rect(16, 2, 6, 12, 10)
    rt.rectb(24, 2, 7, 12, 11)


def draw_circles_and_ellipses(rt):
    rt.circ(5, 8, 4, 8)
    rt.circb(14, 8, 5, 9)
    rt.elli(20, 3, 5, 11, 10)
    rt.ellib(26, 3, 6, 11, 11)


def draw_triangles_and_fill(rt):
    # 先画封闭圆框，再从圆心填充内部，边框不会被覆盖。
    rt.circb(6, 8, 5, 7)
    rt.fill(6, 8, 3)

    rt.tri(13, 13, 18, 2, 22, 13, 10)
    rt.trib(23, 13, 27, 2, 31, 13, 11)


def main():
    upyxel.init(start_audio=False)
    try:
        def update(rt):
            if rt.frame_count >= PAGE_FRAMES * PAGE_COUNT * REPEATS:
                rt.quit()

        def draw(rt):
            rt.cls(0)
            page = (rt.frame_count // PAGE_FRAMES) % PAGE_COUNT
            if page == 0:
                draw_lines_and_rectangles(rt)
            elif page == 1:
                draw_circles_and_ellipses(rt)
            else:
                draw_triangles_and_fill(rt)

        print("基础图形演示开始：每页约 2 秒，共重复两轮")
        upyxel.run(update, draw, fps=FPS)
        print("基础图形演示结束")
    finally:
        upyxel.destroy()


main()
