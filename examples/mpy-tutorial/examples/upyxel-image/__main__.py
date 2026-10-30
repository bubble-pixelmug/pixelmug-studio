# MicroPyxel image example: extract 9x9 animal sprites from canvas.png and show three per page.
# Demonstrates images, load_from_png, blt, cls, run, quit, and destroy.
# canvas.png is a complete 256x256 sprite sheet; SPRITES use coordinates within that canvas.
# Passing True while loading imports PNG colors; transparent pixels become palette index 0.
# This example uses a black background to display those transparent pixels.
# Each page is shown for about 3 seconds, then the program exits after all four pages.

import micropyxel as upyxel


FPS = 20
PAGE_FRAMES = FPS * 3
SPRITE_SIZE = 9

# Each coordinate points to the top-left corner of a 9x9 sprite in the 256x256 canvas.
SPRITES = (
    ("Old mouse", 120, 107),
    ("Sheep", 120, 116),
    ("Monkey", 138, 116),
    ("Chicken", 147, 116),
    ("Dolphin", 111, 134),
    ("Rabbit", 147, 134),
    ("Crow", 147, 125),
    ("Fish", 174, 134),
    ("Dog", 57, 143),
    ("Squirrel", 147, 143),
)

PAGES = (
    (0, 1, 2),       # Old mouse, sheep, monkey
    (3, 4, 5),       # Chicken, dolphin, rabbit
    (6, 7, 8),       # Crow, fish, dog
    (9, 0, 1),       # Squirrel, old mouse, sheep
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
                print("Page", page + 1, ":", ", ".join(names))
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

        print("Sprite image demo started")
        upyxel.run(update, draw, fps=FPS)
        print("Sprite image demo finished")
    finally:
        upyxel.destroy()


main()
