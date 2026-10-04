import micropyxel as pyxel
from maopaoBleApp import BleAppService, DATA_TYPE_RAW

ble = BleAppService("BleSimpleControl")
message = "DISC"


def on_connect(conn):
    global message
    message = "CONN"


def on_disconnect(conn, reason):
    global message
    message = "DISC"


def receive_coordinate(data_type, payload, context):
    global message
    if data_type == DATA_TYPE_RAW and len(payload) == 2:
        message = "(%d,%d)" % (payload[0], payload[1])


def update(rt):
    ble.poll()


def draw(rt):
    rt.cls(0)
    x = (rt.width - len(message) * 4) // 2
    rt.text(x, (rt.height - 6) // 2, message, 7)


ble.on_connect(on_connect)
ble.on_disconnect(on_disconnect)
ble.on_simple(receive_coordinate)

pyxel.init(start_audio=False)
try:
    ble.start()
    pyxel.run(update, draw, fps=30)
finally:
    ble.deinit()
    pyxel.destroy()
