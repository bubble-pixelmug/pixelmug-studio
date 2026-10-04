# MicroPyxel 图片变换示例：分三页展示翻转、缩放和旋转。
# 展示 API：images、load_from_png、blt 的负宽高、rotate 和 scale 参数。
# 每一页左侧显示原始海豚，右侧显示变换结果：
# 第 1 页依次展示水平、垂直、双向翻转，各停留 1 秒；
# 第 2 页依次展示 0.5、1.0、1.5 倍缩放，各停留 1 秒；
# 第 3 页顺时针旋转两圈，然后结束。
#
# blt(x, y, img, u, v, w, h, colkey, rotate, scale)
# w/h 为负数时分别水平/垂直翻转；旋转和缩放围绕图块中心进行。

import micropyxel as upyxel


FPS = 20
STEP_FRAMES = FPS
FLIP_FRAMES = STEP_FRAMES * 3
SCALE_FRAMES = STEP_FRAMES * 3
ROTATE_FRAMES = FPS * 6
TOTAL_FRAMES = FLIP_FRAMES + SCALE_FRAMES + ROTATE_FRAMES

SOURCE_X = 111
SOURCE_Y = 134
SPRITE_SIZE = 9

ORIGINAL_X = 6
TRANSFORM_X = 20
SCALE_X = 18
DRAW_Y = 4


def draw_dolphin(rt, x, y, width=SPRITE_SIZE, height=SPRITE_SIZE,
                 rotate=None, scale=None):
    rt.blt(
        x,
        y,
        0,
        SOURCE_X,
        SOURCE_Y,
        width,
        height,
        None,
        rotate,
        scale,
    )


def main():
    upyxel.init(start_audio=False)
    try:
        image_bank = upyxel.images(0)
        image_bank.load_from_png(0, 0, "canvas.png", True)
        shown_page = -1

        def update(rt):
            nonlocal shown_page

            if rt.frame_count < FLIP_FRAMES:
                page = 1
            elif rt.frame_count < FLIP_FRAMES + SCALE_FRAMES:
                page = 2
            else:
                page = 3

            if page != shown_page:
                if page == 1:
                    print("第 1 页：水平、垂直和双向翻转")
                elif page == 2:
                    print("第 2 页：0.5、1.0 和 1.5 倍缩放")
                else:
                    print("第 3 页：顺时针旋转两圈")
                shown_page = page

            if rt.frame_count >= TOTAL_FRAMES:
                rt.quit()

        def draw(rt):
            rt.cls(0)

            # 左侧始终显示原图，作为变换前后的对照。
            draw_dolphin(rt, ORIGINAL_X, DRAW_Y)

            if rt.frame_count < FLIP_FRAMES:
                # 第 1 页：每秒切换一种翻转方式。
                step = rt.frame_count // STEP_FRAMES
                if step == 0:
                    draw_dolphin(rt, TRANSFORM_X, DRAW_Y, -SPRITE_SIZE, SPRITE_SIZE)
                elif step == 1:
                    draw_dolphin(rt, TRANSFORM_X, DRAW_Y, SPRITE_SIZE, -SPRITE_SIZE)
                else:
                    draw_dolphin(rt, TRANSFORM_X, DRAW_Y, -SPRITE_SIZE, -SPRITE_SIZE)
                return

            if rt.frame_count < FLIP_FRAMES + SCALE_FRAMES:
                # 第 2 页：每秒切换一个固定缩放倍数。
                page_frame = rt.frame_count - FLIP_FRAMES
                scales = (0.5, 1.0, 1.5)
                scale = scales[page_frame // STEP_FRAMES]
                draw_dolphin(
                    rt,
                    SCALE_X,
                    DRAW_Y,
                    rotate=0,
                    scale=scale,
                )
                return

            # 第 3 页：6 秒内顺时针旋转两圈。
            page_frame = rt.frame_count - FLIP_FRAMES - SCALE_FRAMES
            angle = (page_frame + 1) * 720 / ROTATE_FRAMES
            draw_dolphin(
                rt,
                TRANSFORM_X,
                DRAW_Y,
                rotate=angle,
                scale=1.0,
            )

        print("图片变换演示开始")
        upyxel.run(update, draw, fps=FPS)
        print("图片变换演示结束")
    finally:
        upyxel.destroy()


main()