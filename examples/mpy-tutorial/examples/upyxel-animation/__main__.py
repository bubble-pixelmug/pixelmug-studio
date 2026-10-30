# MicroPyxel beginner example: a white ball moves inside the screen and bounces off the edges.
# Demonstrates init, run(update, draw), cls, circ, quit, and destroy.
# update changes the position; draw clears and redraws the frame.
# run refreshes automatically after draw, so render_graphics is not needed here.
# The target frame rate is 20 FPS and the ball moves one pixel per frame.
# After about 15 seconds, quit ends the loop and destroy releases resources.
# quit does not release resources, and destroy does not replace exiting the loop.

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
            # Keep the entire ball inside the screen by maintaining one radius from each edge.
            if x <= RADIUS or x >= rt.width - 1 - RADIUS:
                dx = -dx
            if y <= RADIUS or y >= rt.height - 1 - RADIUS:
                dy = -dy
            if time.ticks_diff(time.ticks_ms(), started) >= DURATION_MS:
                rt.quit()

        def draw(rt):
            rt.cls(0)  # Clear the previous frame so the motion leaves no trail.
            rt.circ(x, y, RADIUS, 7)  # Palette color 7 is white; color 0 is black.

        print("Ball animation started; it will finish automatically after about 15 seconds")
        upyxel.run(update, draw, fps=20)
        print("Ball animation finished")
    finally:
        upyxel.destroy()


main()
