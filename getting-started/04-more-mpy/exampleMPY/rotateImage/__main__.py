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
    # Use the right half of the PNG as a repeated background for the 32x16 display.
    pyxel.blt(0, 0, 0, 16, 0, 16, 16)
    pyxel.blt(16, 0, 0, 16, 0, 16, 16)
    # Rotate the left half of the PNG without transparency or scaling.
    pyxel.blt(TILE_X, TILE_Y, 0, 0, 0, 16, 16, None, angle, None)


pyxel.init(start_audio=False)
try:
    # The final positional argument is include_colors; True loads the image colors.
    pyxel.images(0).load_from_png(0, 0, "asset.png", True)
    last_rotate_ms = time.ticks_ms()
    pyxel.run(update, draw, fps=30)
finally:
    pyxel.destroy()
