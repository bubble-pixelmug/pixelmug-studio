import micropyxel as pyxel
from maopaoBleApp import BleAppService, DATA_TYPE_RAW

# 与 WebApp 的 appId 一致。
ble = BleAppService("GettingStartedLight")
x, y = 16, 8
spark = 0
COLOR = 10


def receive(data_type, data, context):
    global x, y, spark
    if data_type != DATA_TYPE_RAW or len(data) != 3:
        return
    x, y = min(data[1], 31), min(data[2], 15)
    if data[0] == 2:
        spark = 12


def update(rt):
    global spark
    ble.poll()
    spark = max(0, spark - 1)


def draw(rt):
    pyxel.cls(0)
    pyxel.rect(x - 1, y - 1, 3, 3, COLOR)
    if spark:
        radius = (12 - spark) // 2 + 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                       (1, 1), (-1, 1), (1, -1), (-1, -1)):
            pyxel.pset(x + dx * radius, y + dy * radius, 9)


def close(rt, reason, error):
    ble.deinit()
    pyxel.destroy()


ble.on_simple(receive)
ble.start()
pyxel.init(start_audio=False)
pyxel.run(update, draw, fps=30, on_exit=close)
