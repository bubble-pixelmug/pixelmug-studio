import time
import micropyxel as pyxel
from maopaoBleApp import BleAppService

ble = BleAppService("BleEventState")
count = 0
last_tick = 0


def read_state():
    return {"count": count}


def update(rt):
    global count, last_tick
    ble.poll()
    now = time.ticks_ms()
    if time.ticks_diff(now, last_tick) < 1000:
        return
    last_tick = now
    count = (count + 1) % 100

    # 计数始终继续；应用会话就绪时才向网页推送。
    if ble.ready:
        ble.publish_state()
        if count == 0:
            ble.send_event("counterReset", {"count": count})
        elif count % 10 == 0:
            ble.send_event("multipleOfTen", {"count": count})


def draw(rt):
    rt.cls(0)
    text = str(count)
    rt.text((rt.width - len(text) * 4) // 2, (rt.height - 6) // 2, text, 10)


# 网页 requestSnapshot() 读取的内容由这个函数提供。
ble.set_state_provider(read_state)

pyxel.init(start_audio=False)
try:
    ble.start()
    last_tick = time.ticks_ms()
    pyxel.run(update, draw, fps=20)
finally:
    ble.deinit()
    pyxel.destroy()
