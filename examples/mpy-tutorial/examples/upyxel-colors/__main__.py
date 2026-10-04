# MicroPyxel 颜色示例：分四页展示默认颜色、自定义 RGB、索引映射和有序抖动。
# 展示 API：NUM_COLORS、color_rgb、set_color、set_palette、pal、dither。
# 绘图接口接收的是颜色索引，不是 0xRRGGBB；set_color/set_palette 修改索引对应的 RGB。
# pal 只改变后续绘图写入的索引；dither 用规则像素图案模拟覆盖率，不进行 Alpha 混合。
# 每页显示约 3 秒，演示完成后自动退出。

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
        print("默认调色板，共", upyxel.NUM_COLORS, "种颜色")
        for index in range(upyxel.NUM_COLORS):
            print(index, upyxel.color_rgb(index))
    elif page == 1:
        upyxel.set_palette(CUSTOM_COLORS)
        print("set_palette：索引 0..7 已替换为自定义 RGB")
        for index in range(len(CUSTOM_COLORS)):
            print(index, upyxel.color_rgb(index))
    elif page == 2:
        upyxel.set_palette(DEFAULT_COLORS)
        upyxel.set_color(8, 0xFF0000)
        print("set_color：索引 8 =", upyxel.color_rgb(8))
        print("pal：右侧把绘图颜色 7 映射到索引 8")
    else:
        upyxel.set_palette(DEFAULT_COLORS)
        print("dither：从左到右依次为 0.25、0.5、0.75、1.0")


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

        print("颜色 API 演示开始")
        upyxel.run(update, draw, fps=FPS)
        print("颜色 API 演示结束")
    finally:
        upyxel.destroy()


main()