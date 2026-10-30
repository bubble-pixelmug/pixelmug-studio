# MicroPyxel beginner example: three pages of basic shape drawing APIs.
# Page 1: pixels, lines, filled rectangles, and rectangle outlines.
# Page 2: filled circles, circle outlines, filled ellipses, and ellipse outlines.
# Page 3: filled and outlined triangles, plus fill inside a closed region.
# Demonstrates pset, line, rect, rectb, circ, circb, elli, ellib, tri, trib, and fill.
# Each page is shown for about 2 seconds; all pages repeat twice before the program exits.
# Coordinates may extend beyond the screen and are clipped; colors use the palette index.

import micropyxel as upyxel


FPS = 20
PAGE_FRAMES = FPS * 2
PAGE_COUNT = 3
REPEATS = 2


def draw_lines_and_rectangles(rt):
    # Show pixels and crossing lines on the left.
    rt.line(0, 0, 13, 15, 8)
    rt.line(0, 15, 13, 0, 9)
    rt.pset(6, 7, 7)
    rt.pset(7, 8, 7)

    # Show a filled rectangle and a rectangle outline on the right.
    rt.rect(16, 2, 6, 12, 10)
    rt.rectb(24, 2, 7, 12, 11)


def draw_circles_and_ellipses(rt):
    rt.circ(5, 8, 4, 8)
    rt.circb(14, 8, 5, 9)
    rt.elli(20, 3, 5, 11, 10)
    rt.ellib(26, 3, 6, 11, 11)


def draw_triangles_and_fill(rt):
    # Draw a closed outline first, then fill from its center without covering the outline.
    rt.circb(6, 8, 5, 7)
    rt.fill(6, 8, 3)

    rt.tri(13, 13, 18, 2, 22, 13, 10)
    rt.trib(23, 13, 27, 2, 31, 13, 11)


def main():
    upyxel.init(start_audio=False)
    try:
        def update(rt):
            if rt.frame_count >= PAGE_FRAMES * PAGE_COUNT * REPEATS:
                rt.quit()

        def draw(rt):
            rt.cls(0)
            page = (rt.frame_count // PAGE_FRAMES) % PAGE_COUNT
            if page == 0:
                draw_lines_and_rectangles(rt)
            elif page == 1:
                draw_circles_and_ellipses(rt)
            else:
                draw_triangles_and_fill(rt)

        print("Basic shapes demo started: each page lasts about 2 seconds and repeats twice")
        upyxel.run(update, draw, fps=FPS)
        print("Basic shapes demo finished")
    finally:
        upyxel.destroy()


main()
