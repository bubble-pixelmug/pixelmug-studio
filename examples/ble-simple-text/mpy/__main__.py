import micropyxel as pyxel
from maopaoBleApp import BleAppService, DATA_TYPE_TEXT

ble = BleAppService("BleSimpleText")
message = "DISC"
letters = ""


def on_connect(conn):
    global message, letters
    message = "CONN"
    letters = ""


def on_disconnect(conn, reason):
    global message, letters
    message = "DISC"
    letters = ""


def receive_text(data_type, payload, context):
    global message, letters
    if data_type != DATA_TYPE_TEXT:
        return

    letter = payload.decode("utf-8")
    if len(letter) != 1 or letter < "a" or letter > "z":
        return

    if len(letters) >= 6:
        letters = ""
    letters += letter
    message = letters


def update(rt):
    ble.poll()


def draw(rt):
    rt.cls(0)
    x = (rt.width - len(message) * 4) // 2
    rt.text(x, (rt.height - 6) // 2, message, 7)


ble.on_connect(on_connect)
ble.on_disconnect(on_disconnect)
ble.on_simple(receive_text)

pyxel.init(start_audio=False)
try:
    ble.start()
    pyxel.run(update, draw, fps=20)
finally:
    ble.deinit()
    pyxel.destroy()
