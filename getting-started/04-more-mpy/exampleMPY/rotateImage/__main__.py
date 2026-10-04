import time
import micropyxel as pyxel

ROTATE_INTERVAL_MS = 100
TILE_X, TILE_Y = 8, 0
angle = 0
last_rotate_ms = time.ticks_ms()


def update(rt):
    global angle, last_rotate_ms
    now = time.ticks_ms()
    if time.ticks_diff(now, last_rotate_ms) >= ROTATE_INTERVAL_MS:
        angle = (angle + 15) % 360
        last_rotate_ms = now


def draw(rt):
    pyxel.cls(0)
    # PNG 右半边作为背景，重复铺满 32×16 屏幕。
    pyxel.blt(0, 0, 0, 16, 0, 16, 16)
    pyxel.blt(16, 0, 0, 16, 0, 16, 16)
    # PNG 左半边为旋转图块；不指定透明色，也不缩放。
    pyxel.blt(TILE_X, TILE_Y, 0, 0, 0, 16, 16, None, angle, None)


pyxel.init(start_audio=False)
try:
    # 当前接口最后一个位置参数为 include_colors，True 表示载入图片颜色。
    pyxel.images(0).load_from_png(0, 0, "asset.png", True)
    last_rotate_ms = time.ticks_ms()
    pyxel.run(update, draw, fps=30)
finally:
    pyxel.destroy()
