# G-sensor tap counter example.
# Pick up the mug and place it back on the table. Each EVENT_TAP increments the counter
# and plays an expanding ring animation.
# EVENT_TAP comes from the motion sensor's Z-axis impact detection, not the bottom touch area's click event.
# The current interface does not distinguish single, double, or triple taps; all detected taps produce EVENT_TAP.
# Demonstrates on(), off(), EVENT_TAP, and circb().

import time
import g_sensor
import micropyxel as upyxel


FPS = 30
PULSE_FRAMES = 10


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while g_sensor.is_ready() != g_sensor.STATUS_OK:
        if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
            raise RuntimeError("g_sensor not ready")
        time.sleep_ms(20)


def three_digits(value):
    text = str(value % 1000)
    while len(text) < 3:
        text = "0" + text
    return text


def main():
    display_ready = False
    callback_registered = False
    pending_taps = 0

    def on_tap(events):
        nonlocal pending_taps
        if events & g_sensor.EVENT_TAP:
            pending_taps += 1

    try:
        wait_until_ready()
        upyxel.init(start_audio=False)
        display_ready = True

        if not g_sensor.on(g_sensor.EVENT_TAP, on_tap):
            raise RuntimeError("g_sensor tap callback registration failed")
        callback_registered = True

        count = 0
        pulse = 0

        def update(rt):
            nonlocal pending_taps, count, pulse
            if pending_taps:
                taps = pending_taps
                pending_taps = 0
                count = (count + taps) % 1000
                pulse = PULSE_FRAMES
                print("placement count:", count)
            elif pulse > 0:
                pulse -= 1

        def draw(rt):
            rt.cls(0)
            text = three_digits(count)
            x = (rt.width - len(text) * rt.DEFAULT_FONT_WIDTH) // 2
            y = (rt.height - rt.DEFAULT_FONT_HEIGHT) // 2
            rt.text(x, y, text, 7)
            if pulse > 0:
                radius = 1 + (PULSE_FRAMES - pulse) // 2
                rt.circb(rt.width // 2, rt.height // 2, radius, 8)

        print("Counter started: pick up the mug, then place it gently on the table")
        upyxel.run(update, draw, fps=FPS)
    finally:
        if callback_registered:
            g_sensor.off(on_tap)
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()
