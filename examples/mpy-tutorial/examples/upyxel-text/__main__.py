# MicroPyxel text example: show two static lines, then scroll a long message from right to left.
# Demonstrates the text, cls, run, quit, and destroy APIs.
# The built-in font uses 4x6 pixel glyphs and supports character codes 32..127.
# This example uses only ASCII letters, numbers, and spaces.
# The text API does not wrap, scale, or scroll automatically; scrolling is implemented by changing x each frame.
# The first 3 seconds show static text, followed by about 12 seconds of scrolling.

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
                # Move one pixel every two frames for easier reading on the small display.
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

        print("Text demo started: static text followed by scrolling text")
        upyxel.run(update, draw, fps=FPS)
        print("Text demo finished")
    finally:
        upyxel.destroy()


main()
