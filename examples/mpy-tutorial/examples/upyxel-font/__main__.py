# MicroPyxel custom-font example.
# Loads a small BDF subset and renders Western European, Chinese, Japanese, and Korean greetings.
# Accented Latin and CJK characters verify Unicode code-point lookup after UTF-8 decoding.

import micropyxel as upyxel


FPS = 20
GREETINGS = (
    "Hello!",
    "Bonjour",
    "Grüß dich",
    "Ciao",
    "¡Hola",
    "你好",
    "こんにちは",
    "안녕하세요",
)
COLORS = (7, 8, 10, 11, 12, 13, 14, 15)


def main():
    upyxel.init(start_audio=False)
    try:
        font = upyxel.Font("demo-font.bdf")
        widths = [font.text_width(text) for text in GREETINGS]
        for text, width in zip(GREETINGS, widths):
            print(text, width, "px")

        greeting_index = 0
        scroll_x = upyxel.width

        def update(rt):
            nonlocal greeting_index, scroll_x
            scroll_x -= 1
            if scroll_x < -widths[greeting_index]:
                if greeting_index == len(GREETINGS) - 1:
                    rt.quit()
                    return
                greeting_index += 1
                scroll_x = rt.width

        def draw(rt):
            rt.cls(0)
            rt.text(
                scroll_x,
                2,
                GREETINGS[greeting_index],
                COLORS[greeting_index],
                font,
            )

        upyxel.run(update, draw, fps=FPS)
    finally:
        upyxel.destroy()


main()