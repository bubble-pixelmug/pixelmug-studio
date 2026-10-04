import time
import micropyxel as pyxel
from pixel_dust import PixelDust
import g_sensor
import mpy_button

WIDTH, HEIGHT = 32, 16
COLUMN_WIDTH, COLUMN_HEIGHT = 5, 10
ACCEL_SCALE = 0.1
ELASTICITY = 210


def main():
    dust = None
    display_ready = False
    try:
        if not g_sensor.init():
            raise RuntimeError("G-sensor init failed")
        deadline = time.ticks_add(time.ticks_ms(), 5000)
        while g_sensor.is_ready() != g_sensor.STATUS_OK:
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                raise RuntimeError("G-sensor not ready")
            time.sleep_ms(50)
        while True:
            try:
                g_sensor.get_accel()
                break
            except RuntimeError:
                if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                    raise RuntimeError("G-sensor data not ready")
                time.sleep_ms(20)
        pyxel.init(start_audio=False)
        display_ready = True
        # 0 / 1 palette

        pyxel.set_palette([0x000000, 0xFFFFFF])
        count = COLUMN_WIDTH * COLUMN_HEIGHT
        dust = PixelDust(WIDTH, HEIGHT, capacity=count, scale=5,
                         elasticity=ELASTICITY, sort=True)
        dust.clear_obstacles()
        dust.set_bound_mode(PixelDust.BOUND_BOUNCE)

        left = (WIDTH - COLUMN_WIDTH) // 2
        snapshot = bytearray(count * 4)

        def reset():
            alive = dust.alive_snapshot(snapshot)
            for i in range(alive):
                dust.despawn(snapshot[i * 4])
            for y in range(HEIGHT - COLUMN_HEIGHT, HEIGHT):
                for x in range(left, left + COLUMN_WIDTH):
                    dust.spawn(x, y, 0, 0, 1)

        mpy_button.clear()
        reset()

        def update(rt):
            if mpy_button.get() == "click":
                mpy_button.clear()
                reset()
                return
            ax, ay, az = g_sensor.get_accel()            
            dust.iterate(ax * 128 * ACCEL_SCALE,
                         az * 128 * ACCEL_SCALE, 0)

        def draw(rt):
            pyxel.cls(0)
            alive = dust.alive_snapshot(snapshot)
            for i in range(alive):
                offset = i * 4
                pyxel.pset(snapshot[offset + 1], snapshot[offset + 2], 1)

        draw(None)
        pyxel.render_graphics()
        pyxel.run(update, draw, fps=30)
    finally:
        try:
            if dust is not None:
                dust.deinit()
        finally:
            try:
                if display_ready:
                    pyxel.destroy()
            finally:
                g_sensor.deinit()


if __name__ == "__main__":
    main()
