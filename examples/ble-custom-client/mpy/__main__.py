import bluetooth
import micropyxel as pyxel
from maopaoBleApp import BleAppService, AUTH_MODE_NONE, DATA_TYPE_RAW

ble = BleAppService("BleCustomClient")
message = "DISC"


def on_connect(conn):
    global message
    message = "CONN"


def on_disconnect(conn, reason):
    global message
    message = "DISC"


def on_number(data_type, payload, context):
    global message
    # C3 发送一个二进制字节 0..9，不是 ASCII 字符 "0".."9"。
    if data_type == DATA_TYPE_RAW and len(payload) == 1 and payload[0] <= 9:
        message = str(payload[0])


def update(rt):
    ble.poll()


def draw(rt):
    rt.cls(0)
    x = (rt.width - len(message) * 4) // 2
    rt.text(x, (rt.height - 6) // 2, message, 10)


ble.on_connect(on_connect)
ble.on_disconnect(on_disconnect)
ble.on_simple(on_number)
ble.on_error(lambda error: print("[BLE]", error))

pyxel.init(start_audio=False)
try:
    ble.start(auth_mode=AUTH_MODE_NONE)
    # 启动后等待连接时打印一次，方便填写 C3 的 TARGET_ADDRESS。
    _, mac = bluetooth.BLE().config("mac")
    print("PixelMug BLE MAC:", ":".join("%02X" % b for b in mac))
    pyxel.run(update, draw, fps=20)
finally:
    ble.deinit()
    pyxel.destroy()