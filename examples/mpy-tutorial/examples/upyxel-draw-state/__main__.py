# MicroPyxel 绘图状态示例：分两段展示裁剪窗口和相机滚动。
# 展示 API：clip(x, y, w, h)、clip()、camera(x, y)、camera()。
# 第 1 段让彩色图案穿过固定裁剪框，框外部分不会被绘制。
# 第 2 段让小球在较宽的场景中移动，相机跟随后背景向左滚动。
# clip 和 camera 会持续影响后续绘图，使用后应调用无参数形式恢复默认状态。

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
    # 6×6 彩色图案，便于观察进入和离开裁剪区的过程。
    rt.rect(x, y, 6, 6, 12)
    rt.rect(x + 1, y + 1, 4, 4, 10)
    rt.rect(x + 2, y + 2, 2, 2, 8)


def draw_world(rt):
    # 重复的彩色柱子构成宽于屏幕的场景，滚动时更容易观察相机运动。
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
                    print("阶段 1：clip 裁剪窗口")
                else:
                    print("阶段 2：camera 跟随移动")
                shown_phase = phase

            if rt.frame_count >= TOTAL_FRAMES:
                rt.quit()

        def draw(rt):
            # 每帧先恢复默认状态，避免上一段的绘图状态影响下一段。
            upyxel.clip()
            upyxel.camera()
            rt.cls(0)

            if rt.frame_count < CLIP_FRAMES:
                frame = rt.frame_count
                pattern_x = -6 + frame * 40 // CLIP_FRAMES

                upyxel.clip(CLIP_X, CLIP_Y, CLIP_WIDTH, CLIP_HEIGHT)
                draw_pattern(rt, pattern_x, 5)
                upyxel.clip()

                # 裁剪框在恢复全屏裁剪后绘制，因此始终完整可见。
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

            # 屏幕边框不受相机影响，用来强调相机只移动场景坐标。
            rt.rectb(0, 0, rt.width, rt.height, 7)

        print("绘图状态演示开始")
        upyxel.run(update, draw, fps=FPS)
        print("绘图状态演示结束")
    finally:
        upyxel.clip()
        upyxel.camera()
        upyxel.destroy()


main()