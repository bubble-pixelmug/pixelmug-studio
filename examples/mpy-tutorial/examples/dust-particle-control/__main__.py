"""Dust particle control example: click to launch particles that disappear at the bottom."""

import random

import micropyxel as upyxel
import mpy_button
import pixel_dust


WIDTH = 32
HEIGHT = 16
CAPACITY = 32
DUST_SCALE = 5
DUST_ELASTICITY = 210
FPS = 30


dust = pixel_dust.PixelDust(WIDTH, HEIGHT, CAPACITY, DUST_SCALE, DUST_ELASTICITY)
dust.set_bound_mode(pixel_dust.PixelDust.BOUND_BOUNCE)
snapshot = bytearray(CAPACITY * 4)


# An 8x2 obstacle in the center of the screen.
for y in range(10, 12):
    for x in range(12, 20):
        dust.set_obstacle(x, y)
for x in range(15, 32):
    dust.set_obstacle(x, 15)


def launch_particle():
    """Launch one particle from the left, occasionally launching a second beside it."""
    def spawn_one(y):
        vx = random.randint(500, 800)
        vy = random.randint(-100, 100)
        try:
            dust.spawn(0, y, vx, vy, random.randint(8, 15))
        except OSError:
            # If the particle pool is temporarily full, wait for existing particles to leave before launching.
            pass

    spawn_one(4)
    if random.randint(0, 3) == 0:
        spawn_one(5)


def remove_bottom_particles():
    """Recycle particles that have reached the bottom row."""
    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        if snapshot[offset + 2] >= HEIGHT - 1:
            dust.despawn(snapshot[offset])


def update(_rt):
    while True:
        event = mpy_button.get()
        if event is None:
            break
        if event == "click":
            launch_particle()

    dust.iterate(0.0, 0.35 * 32, 0.0)
    remove_bottom_particles()


def draw(rt):
    rt.cls(0)
    rt.text(8, 2, "shot", 1)

    for y in range(10, 12):
        for x in range(12, 20):
            rt.pset(x, y, 7)
    for x in range(15, 32):
        rt.pset(x, 15, 7)

    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        rt.pset(snapshot[offset + 1], snapshot[offset + 2], snapshot[offset + 3])


def main():
    mpy_button.clear()
    upyxel.init(start_audio=False)
    try:
        upyxel.run(update, draw, fps=FPS)
    finally:
        mpy_button.clear()
        dust.deinit()
        upyxel.destroy()


main()
