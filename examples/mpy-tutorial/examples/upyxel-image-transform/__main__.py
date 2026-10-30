# MicroPyxel image transformation example: three pages demonstrating flips, scaling, and rotation.
# Demonstrates images, load_from_png, blt negative width/height, and the rotate and scale arguments.
# Each page shows the original dolphin on the left and the transformed result on the right.
# Page 1 cycles through horizontal, vertical, and two-direction flips for one second each.
# Page 2 cycles through 0.5x, 1.0x, and 1.5x scaling for one second each.
# Page 3 rotates clockwise for two full turns, then exits.
# blt(x, y, img, u, v, w, h, colkey, rotate, scale)
# Negative w/h values flip horizontally/vertically; rotation and scaling use the block center.

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
                    print("Page 1: horizontal, vertical, and two-direction flips")
                elif page == 2:
                    print("Page 2: 0.5x, 1.0x, and 1.5x scaling")
                else:
                    print("Page 3: clockwise rotation for two turns")
                shown_page = page

            if rt.frame_count >= TOTAL_FRAMES:
                rt.quit()

        def draw(rt):
            rt.cls(0)

            # Always show the original image as a before-and-after reference.
            draw_dolphin(rt, ORIGINAL_X, DRAW_Y)

            if rt.frame_count < FLIP_FRAMES:
                # Page 1: switch the flip direction every second.
                step = rt.frame_count // STEP_FRAMES
                if step == 0:
                    draw_dolphin(rt, TRANSFORM_X, DRAW_Y, -SPRITE_SIZE, SPRITE_SIZE)
                elif step == 1:
                    draw_dolphin(rt, TRANSFORM_X, DRAW_Y, SPRITE_SIZE, -SPRITE_SIZE)
                else:
                    draw_dolphin(rt, TRANSFORM_X, DRAW_Y, -SPRITE_SIZE, -SPRITE_SIZE)
                return

            if rt.frame_count < FLIP_FRAMES + SCALE_FRAMES:
                # Page 2: switch the fixed scale factor every second.
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

            # Page 3: rotate clockwise through two turns in six seconds.
            page_frame = rt.frame_count - FLIP_FRAMES - SCALE_FRAMES
            angle = (page_frame + 1) * 720 / ROTATE_FRAMES
            draw_dolphin(
                rt,
                TRANSFORM_X,
                DRAW_Y,
                rotate=angle,
                scale=1.0,
            )

        print("Image transformation demo started")
        upyxel.run(update, draw, fps=FPS)
        print("Image transformation demo finished")
    finally:
        upyxel.destroy()


main()
