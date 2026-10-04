# MicroPyxel 图片示例：从 canvas.png 精灵图中截取 9x9 表情，每页显示三个。
# 展示 API：images、load_from_png、blt、cls、run、quit、destroy。
# canvas.png 是 256x256 的完整画布，SPRITES 直接使用画布坐标。
# 加载时传入 True 导入 PNG 颜色；透明像素成为索引 0，本例用黑色背景承接这些像素。
# 每页显示约 3 秒，四页播放完成后自动退出。

import micropyxel as upyxel


FPS = 20
PAGE_FRAMES = FPS * 3
SPRITE_SIZE = 9

# 每个坐标都是对应 9x9 表情左上角在 256x256 画布中的位置。
SPRITES = (
    ("老鼠", 120, 107),
    ("羊", 120, 116),
    ("猴", 138, 116),
    ("鸡", 147, 116),
    ("海豚", 111, 134),
    ("兔子", 147, 134),
    ("乌龟", 147, 125),
    ("鲸鱼", 174, 134),
    ("狗", 57, 143),
    ("松鼠", 147, 143),
)

PAGES = (
    (0, 1, 2),       # 老鼠、羊、猴
    (3, 4, 5),       # 鸡、海豚、兔子
    (6, 7, 8),       # 乌龟、鲸鱼、狗
    (9, 0, 1),       # 松鼠、老鼠、羊
)


def main():
    upyxel.init(start_audio=False)
    try:
        image_bank = upyxel.images(0)
        image_bank.load_from_png(0, 0, "canvas.png", True)
        shown_page = -1

        def update(rt):
            nonlocal shown_page
            page = min(rt.frame_count // PAGE_FRAMES, len(PAGES) - 1)
            if page != shown_page:
                names = [SPRITES[index][0] for index in PAGES[page]]
                print("第", page + 1, "页：", "、".join(names))
                shown_page = page
            if rt.frame_count >= PAGE_FRAMES * len(PAGES):
                rt.quit()

        def draw(rt):
            rt.cls(0)
            page = min(rt.frame_count // PAGE_FRAMES, len(PAGES) - 1)
            for position, sprite_index in enumerate(PAGES[page]):
                _, source_x, source_y = SPRITES[sprite_index]
                screen_x = 1 + position * 10
                rt.blt(
                    screen_x,
                    3,
                    0,
                    source_x,
                    source_y,
                    SPRITE_SIZE,
                    SPRITE_SIZE,
                    None,
                )

        print("表情图片演示开始")
        upyxel.run(update, draw, fps=FPS)
        print("表情图片演示结束")
    finally:
        upyxel.destroy()


main()