# MicroPyxel color example: four pages covering the default palette, custom RGB colors,
# palette index mapping, and ordered dithering.
# Demonstrates NUM_COLORS, color_rgb, set_color, set_palette, pal, and dither.
# Drawing APIs receive palette indices rather than 0xRRGGBB values.
# set_color and set_palette update the RGB values associated with palette indices.
# pal changes the indices written by later drawing calls; dither simulates coverage using
# an ordered pixel pattern and does not perform alpha blending.
# Each page is shown for about 3 seconds before the demo exits.

import micropyxel as upyxel


FPS = 20
PAGE_SECONDS = 3
PAGE_FRAMES = FPS * PAGE_SECONDS
PAGE_COUNT = 4

DEFAULT_COLORS = (
    0x000000,
    0x2B335F,
    0x7E2072,
    0x19959C,
    0x8B4852,
    0x395C98,
    0xA9C1FF,
    0xEEEEEE,
    0xD4186C,
    0xD38441,
    0xE9C35B,
    0x70C6A9,
    0x7696DE,
    0xA3A3A3,
    0xFF9798,
    0xEDC7B0,
)

CUSTOM_COLORS = (
    0x080C18,
    0xFF3B30,
    0xFF9500,
    0xFFCC00,
    0x34C759,
    0x00C7BE,
    0x007AFF,
    0xAF52DE,
)


def configure_page(page):
    upyxel.pal()
    upyxel.dither(1)

    if page == 0:
        upyxel.set_palette(DEFAULT_COLORS)
        print("Default palette:", upyxel.NUM_COLORS, "colors")
        for index in range(upyxel.NUM_COLORS):
            print(index, upyxel.color_rgb(index))
    elif page == 1:
        upyxel.set_palette(CUSTOM_COLORS)
        print("set_palette: indices 0..7 replaced with custom RGB colors")
        for index in range(len(CUSTOM_COLORS)):
            print(index, upyxel.color_rgb(index))
    elif page == 2:
        upyxel.set_palette(DEFAULT_COLORS)
        upyxel.set_color(8, 0xFF0000)
        print("set_color: index 8 =", upyxel.color_rgb(8))
        print("pal: the right side maps drawing color 7 to index 8")
    else:
        upyxel.set_palette(DEFAULT_COLORS)
        print("dither: left to right coverage values are 0.25, 0.5, 0.75, and 1.0")


def draw_default_palette(rt):
    for index in range(upyxel.NUM_COLORS):
        rt.rect(index * 2, 0, 2, rt.height, index)


def draw_custom_palette(rt):
    for index in range(len(CUSTOM_COLORS)):
        rt.rect(index * 4, 0, 4, rt.height, index)


def draw_palette_mapping(rt):
    rt.cls(0)
    upyxel.pal()
    rt.rect(1, 2, 13, 12, 7)
    upyxel.pal(7, 8)
    rt.rect(18, 2, 13, 12, 7)
    upyxel.pal()


def draw_dither(rt):
    rt.cls(0)
    for index, alpha in enumerate((0.25, 0.5, 0.75, 1.0)):
        upyxel.dither(alpha)
        rt.rect(index * 8, 0, 8, rt.height, 12)
    upyxel.dither(1)


def main():
    upyxel.init(start_audio=False)
    try:
        configured_page = -1

        def update(rt):
            nonlocal configured_page
            page = min(rt.frame_count // PAGE_FRAMES, PAGE_COUNT - 1)
            if page != configured_page:
                configure_page(page)
                configured_page = page
            if rt.frame_count >= PAGE_FRAMES * PAGE_COUNT:
                rt.quit()

        def draw(rt):
            page = min(rt.frame_count // PAGE_FRAMES, PAGE_COUNT - 1)
            if page == 0:
                draw_default_palette(rt)
            elif page == 1:
                draw_custom_palette(rt)
            elif page == 2:
                draw_palette_mapping(rt)
            else:
                draw_dither(rt)

        print("Color API demo started")
        upyxel.run(update, draw, fps=FPS)
        print("Color API demo finished")
    finally:
        upyxel.destroy()


main()
