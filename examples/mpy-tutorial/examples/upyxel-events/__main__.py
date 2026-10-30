# MicroPyxel application event example: tap the PixelMug button to pause or resume the counter.
# Demonstrates on, emit, state, off, mpy_button.get, and mpy_button.clear.
# The counter starts at 000, increments every 500 ms, and wraps to 000 after 999.
# mpy_button provides device button events; emit converts click into the internal toggle_pause event.
# run dispatches events at the start of the next frame, and the handler uses state() to share pause state.
# The example runs continuously until it is stopped in Studio.

import time
import micropyxel as upyxel
import mpy_button


FPS = 20
COUNT_INTERVAL_MS = 500
EVENT_TOGGLE_PAUSE = "toggle_pause"


def three_digits(value):
    text = str(value)
    while len(text) < 3:
        text = "0" + text
    return text


def main():
    upyxel.init(start_audio=False)
    app_state = upyxel.state()
    app_state.clear()
    app_state["count"] = 0
    app_state["paused"] = False
    app_state["last_count_ms"] = time.ticks_ms()

    def toggle_pause(event):
        state = upyxel.state()
        state["paused"] = not state["paused"]
        # Do not accumulate time while paused; wait for a full 500 ms after resuming.
        state["last_count_ms"] = time.ticks_ms()
        if state["paused"]:
            print("Counter paused")
        else:
            print("Counter resumed")

    upyxel.on(EVENT_TOGGLE_PAUSE, toggle_pause)
    mpy_button.clear()

    try:
        def update(rt):
            # Drain pending button events. A single click becomes a MicroPyxel application event;
            # double-click events are ignored in this example.
            while True:
                button_event = mpy_button.get()
                if button_event is None:
                    break
                if button_event == "click":
                    rt.emit(EVENT_TOGGLE_PAUSE)

            state = rt.state()
            if state["paused"]:
                return

            now = time.ticks_ms()
            # Use a fixed time step so a late frame does not cause long-term counter drift.
            while time.ticks_diff(now, state["last_count_ms"]) >= COUNT_INTERVAL_MS:
                state["count"] = (state["count"] + 1) % 1000
                state["last_count_ms"] = time.ticks_add(
                    state["last_count_ms"], COUNT_INTERVAL_MS
                )

        def draw(rt):
            state = rt.state()
            rt.cls(0)
            text = three_digits(state["count"])
            x = (rt.width - len(text) * rt.DEFAULT_FONT_WIDTH) // 2
            y = (rt.height - rt.DEFAULT_FONT_HEIGHT) // 2
            color = 10 if state["paused"] else 7
            rt.text(x, y, text, color)

        print("Counter started: tap the button to pause or resume")
        upyxel.run(update, draw, fps=FPS)
    finally:
        upyxel.off(EVENT_TOGGLE_PAUSE, toggle_pause)
        mpy_button.clear()
        app_state.clear()
        upyxel.destroy()


main()
