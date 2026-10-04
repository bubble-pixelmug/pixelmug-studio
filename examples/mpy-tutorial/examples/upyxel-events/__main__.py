# MicroPyxel 应用事件示例：单击 PixelMug 底部触摸按键，暂停或恢复计数器。
# 展示 API：on、emit、state、off，以及 mpy_button.get、mpy_button.clear。
# 计数器从 000 开始，每 500 ms 加 1，999 后回到 000。
# mpy_button 提供设备按键事件；emit 将 click 转换成应用内部的 toggle_pause 事件。
# run 在下一帧开始时分发事件，处理器通过 state() 切换共享的暂停状态。
# 示例持续运行，直到在 Studio 中停止。

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
        # 暂停期间不累计时间；恢复后重新等待完整的 500 ms。
        state["last_count_ms"] = time.ticks_ms()
        if state["paused"]:
            print("计数器已暂停")
        else:
            print("计数器继续运行")

    upyxel.on(EVENT_TOGGLE_PAUSE, toggle_pause)
    mpy_button.clear()

    try:
        def update(rt):
            # 取完当前积压的按键事件。单击转换为 MicroPyxel 应用事件；
            # 双击事件不参与本例。
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
            # 使用固定时间步进；即使某帧稍晚，也不会让计数器长期漂移。
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

        print("计数器开始：单击触摸按键可暂停或继续")
        upyxel.run(update, draw, fps=FPS)
    finally:
        upyxel.off(EVENT_TOGGLE_PAUSE, toggle_pause)
        mpy_button.clear()
        app_state.clear()
        upyxel.destroy()


main()