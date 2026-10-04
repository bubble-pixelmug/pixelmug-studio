import time
import micropyxel as pyxel
from maopaoBleApp import BleAppService

ble = BleAppService("BleMinimal")
message = "DISC"
disconnect_pending = False
disconnect_sent_at = None


def on_connect(conn):
    global message
    message = "CONN"


def on_disconnect(conn, reason):
    global message, disconnect_pending, disconnect_sent_at
    message = "DISC"
    disconnect_pending = False
    disconnect_sent_at = None


def echo(params, context):
    global message
    message = "echo"
    return {"text": "echo"}


def request_disconnect(params, context):
    global disconnect_pending, disconnect_sent_at
    disconnect_pending = True
    disconnect_sent_at = None
    return {"accepted": True}


def update(rt):
    global disconnect_pending, disconnect_sent_at
    ble.poll()
    if not disconnect_pending:
        return
    # 先发送命令响应；队列清空后再留出 200 ms，然后请求物理断开。
    if ble.stats()["outbox"] != 0:
        disconnect_sent_at = None
    elif disconnect_sent_at is None:
        disconnect_sent_at = time.ticks_ms()
    elif time.ticks_diff(time.ticks_ms(), disconnect_sent_at) >= 200:
        disconnect_pending = False
        disconnect_sent_at = None
        ble.disconnect()


def draw(rt):
    rt.cls(0)
    x = (rt.width - len(message) * 4) // 2
    color = 11 if message == "CONN" else 8 if message == "DISC" else 10
    rt.text(x, (rt.height - 6) // 2, message, color)


ble.on_connect(on_connect)
ble.on_disconnect(on_disconnect)
ble.command("echo", echo, mutates=False)
ble.command("disconnect", request_disconnect, mutates=False)

pyxel.init(start_audio=False)
try:
    pyxel.set_color(8, 0xFF0000)   # DISC：红色
    pyxel.set_color(11, 0x00FF00)  # CONN：绿色
    ble.start()
    pyxel.run(update, draw, fps=20)
finally:
    ble.deinit()
    pyxel.destroy()