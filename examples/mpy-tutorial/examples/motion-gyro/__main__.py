# G-sensor three-axis angular velocity example.
# The X, Y, and Z axes are shown on separate pages; click the PixelMug bottom touch area to switch pages.
# On each page, the right side of the center line represents positive angular velocity and the left side negative;
# the bar length represents the angular velocity magnitude.
# Strong smoothing and a 500°/s display range make the animation slower and more stable.
# Demonstrates get_gyro(), which returns values in degrees per second (°/s).

import time
import g_sensor
import micropyxel as upyxel
import mpy_button


FPS = 30
MAX_DISPLAY_DPS = 25.0
DISPLAY_SMOOTHING = 0.12
BAR_CENTER = 16
BAR_Y = 7
BAR_HEIGHT = 3
BAR_MAX_LENGTH = 10
AXIS_NAMES = ("X", "Y", "Z")
AXIS_COLORS = (8, 10, 12)


def clamp(value, minimum, maximum):
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if g_sensor.is_ready() == g_sensor.STATUS_OK:
            try:
                return g_sensor.get_gyro()
            except RuntimeError:
                pass
        time.sleep_ms(20)
    raise RuntimeError("g_sensor not ready")


def main():
    display_ready = False
    try:
        wait_until_ready()
        upyxel.init(start_audio=False)
        display_ready = True
        mpy_button.clear()

        values = [0.0, 0.0, 0.0]
        page = 0

        def update(rt):
            nonlocal page

            # Drain pending touch events. Each click switches to the next axis.
            while True:
                button_event = mpy_button.get()
                if button_event is None:
                    break
                if button_event == "click":
                    page = (page + 1) % 3
                    print("Showing {}-axis angular velocity".format(AXIS_NAMES[page]))

            gx, gy, gz = g_sensor.get_gyro()
            samples = (gx, gy, gz)
            for index in range(3):
                values[index] += (
                    samples[index] - values[index]
                ) * DISPLAY_SMOOTHING

        def draw(rt):
            rt.cls(0)
            name = AXIS_NAMES[page]
            color = AXIS_COLORS[page]
            value = values[page]

            label_x = (rt.width - rt.DEFAULT_FONT_WIDTH) // 2
            rt.text(label_x, 0, name, color)

            # The center line is zero; positive angular velocity points right and negative points left.
            rt.line(BAR_CENTER, 5, BAR_CENTER, 12, 7)
            length = int(
                clamp(value / MAX_DISPLAY_DPS, -1.0, 1.0)
                * BAR_MAX_LENGTH
            )
            if length > 0:
                rt.rect(BAR_CENTER, BAR_Y, length, BAR_HEIGHT, color)
            elif length < 0:
                rt.rect(
                    BAR_CENTER + length,
                    BAR_Y,
                    -length,
                    BAR_HEIGHT,
                    color,
                )

            # The three dots at the bottom show the page; the current axis uses its axis color.
            for index in range(3):
                dot_color = color if index == page else 5
                rt.pset(14 + index * 2, 14, dot_color)

        print("Three-axis angular velocity display started: showing the X axis")
        print("Click the bottom touch area to switch between the X, Y, and Z pages")
        upyxel.run(update, draw, fps=FPS)
    finally:
        mpy_button.clear()
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()
