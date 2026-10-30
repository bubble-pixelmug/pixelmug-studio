# MicroPyxel drawing state example: demonstrate clipping and camera scrolling in two phases.
# Demonstrates clip(x, y, w, h), clip(), camera(x, y), and camera().
# Phase 1 moves a colorful pattern through a fixed clipping window; pixels outside the window are hidden.
# Phase 2 moves a ball through a wider scene while the camera follows it and scrolls the background.
# clip and camera continue to affect later drawing, so call their no-argument forms to restore defaults.

import micropyxel as upyxel


FPS = 20
CLIP_SECONDS = 6
CAMERA_SECONDS = 8
CLIP_FRAMES = FPS * CLIP_SECONDS
CAMERA_FRAMES = FPS * CAMERA_SECONDS
TOTAL_FRAMES = CLIP_FRAMES + CAMERA_FRAMES

CLIP_X = 7
CLIP_Y = 2
CLIP_WIDTH = 18
CLIP_HEIGHT = 12

WORLD_WIDTH = 64


def draw_pattern(rt, x, y):
    # A 6x6 color pattern makes movement into and out of the clipping area easy to see.
    rt.rect(x, y, 6, 6, 12)
    rt.rect(x + 1, y + 1, 4, 4, 10)
    rt.rect(x + 2, y + 2, 2, 2, 8)


def draw_world(rt):
    # Repeated colored pillars form a scene wider than the screen, making camera movement visible.
    rt.line(0, 14, WORLD_WIDTH - 1, 14, 6)
    for x in range(0, WORLD_WIDTH, 8):
        height = 3 + (x // 8 % 3) * 2
        color = 8 + (x // 8 % 4)
        rt.rect(x, 14 - height, 3, height, color)


def main():
    upyxel.init(start_audio=False)
    try:
        shown_phase = -1

        def update(rt):
            nonlocal shown_phase

            phase = 0 if rt.frame_count < CLIP_FRAMES else 1
            if phase != shown_phase:
                if phase == 0:
                    print("Phase 1: clipping window")
                else:
                    print("Phase 2: camera follows the moving ball")
                shown_phase = phase

            if rt.frame_count >= TOTAL_FRAMES:
                rt.quit()

        def draw(rt):
            # Restore defaults each frame so one phase cannot affect the other.
            upyxel.clip()
            upyxel.camera()
            rt.cls(0)

            if rt.frame_count < CLIP_FRAMES:
                frame = rt.frame_count
                pattern_x = -6 + frame * 40 // CLIP_FRAMES

                upyxel.clip(CLIP_X, CLIP_Y, CLIP_WIDTH, CLIP_HEIGHT)
                draw_pattern(rt, pattern_x, 5)
                upyxel.clip()

                # Draw the clipping frame after restoring the full-screen clip so it remains complete.
                rt.rectb(CLIP_X, CLIP_Y, CLIP_WIDTH, CLIP_HEIGHT, 7)
                return

            frame = rt.frame_count - CLIP_FRAMES
            ball_x = 2 + frame * (WORLD_WIDTH - 6) // CAMERA_FRAMES
            camera_x = ball_x - 12
            if camera_x < 0:
                camera_x = 0
            elif camera_x > WORLD_WIDTH - rt.width:
                camera_x = WORLD_WIDTH - rt.width

            upyxel.camera(camera_x, 0)
            draw_world(rt)
            rt.circ(ball_x, 10, 2, 10)
            upyxel.camera()

            # The screen border is unaffected by the camera, emphasizing that only the scene moves.
            rt.rectb(0, 0, rt.width, rt.height, 7)

        print("Drawing state demo started")
        upyxel.run(update, draw, fps=FPS)
        print("Drawing state demo finished")
    finally:
        upyxel.clip()
        upyxel.camera()
        upyxel.destroy()


main()
