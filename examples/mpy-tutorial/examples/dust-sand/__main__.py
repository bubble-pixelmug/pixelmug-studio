"""Dust basics: a row of balls responds to simulated gravity and bounces at the bottom."""

import micropyxel as upyxel
import pixel_dust


WIDTH = 32
HEIGHT = 16
CAPACITY = 12
SCALE = 8  # Scale increases the gravity effect.
ELASTICITY = 210  # Elasticity increases the bounce effect.

dust = pixel_dust.PixelDust(WIDTH, HEIGHT, CAPACITY, SCALE, ELASTICITY)
dust.set_bound_mode(pixel_dust.PixelDust.BOUND_BOUNCE)
# dust.set_bound_mode(pixel_dust.PixelDust.BOUND_CLAMP)  # Try BOUND_CLAMP mode to stop particles at the bottom.
snapshot = bytearray(CAPACITY * 4)


# Set small initial differences once; apply no horizontal force after the simulation starts.
BALLS = (
    (2, 0, -18),
    (5, 1, 10),
    (8, 0, 24),
    (11, 1, -8),
    (14, 0, 16),
    (17, 1, -12),
    (20, 0, 8),
    (23, 1, -22),
    (26, 0, 14),
    (29, 1, -6),
)


def seed_particles():
    """Place a row of balls at the top with slightly different spacing and initial horizontal speeds."""
    for index, (x, y, vx) in enumerate(BALLS):
        dust.spawn(x, y, vx, 0, 8 + (index % 8))


def update(_rt):
    # During the simulation, only downward gravity acts; there is no horizontal acceleration.
    dust.iterate(0.0, 0.35 * 32, 0.0)


def draw(rt):
    rt.cls(1)

    # Each particle occupies 4 bytes: [id, x, y, color].
    count = dust.alive_snapshot(snapshot)
    for index in range(count):
        offset = index * 4
        rt.pset(snapshot[offset + 1], snapshot[offset + 2], snapshot[offset + 3])


def main():
    seed_particles()
    upyxel.init(start_audio=False)
    try:
        upyxel.run(update, draw, fps=20)
    finally:
        dust.deinit()
        upyxel.destroy()


main()
