# MicroPyxel beginner example: manually refresh the screen while moving a white pixel
# from left to right and repeating the animation five times.
# Demonstrates init, cls, pset, render_graphics, and destroy.
# Drawing changes only the screen buffer; render_graphics submits the completed frame.
# render_graphics does not clear the screen, sleep, or limit the frame rate, so the
# application must manage those steps itself.
# This example waits 50 ms per frame. The actual frame interval also includes drawing
# and refresh time, so it is not an exact 20 FPS loop.
# It does not use run or update/draw callbacks; the loop ends naturally after five passes.

import time
import micropyxel as upyxel


FRAME_DELAY_MS = 50
REPEATS = 5


def main():
    upyxel.init(start_audio=False)
    try:
        y = upyxel.height // 2
        print("Manual render animation started; moving the pixel from left to right five times")
        for _ in range(REPEATS):
            for x in range(upyxel.width):
                upyxel.cls(0)  # Clear the previous frame.
                upyxel.pset(x, y, 7)  # Palette color 7 is white; color 0 is black.
                upyxel.render_graphics()  # Submit this frame manually.
                time.sleep_ms(FRAME_DELAY_MS)  # Control movement speed and yield execution.
        print("Manual render animation finished")
    finally:
        upyxel.destroy()


main()
