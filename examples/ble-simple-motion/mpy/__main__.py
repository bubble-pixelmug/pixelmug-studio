import struct
import time

import g_sensor
import micropyxel as pyxel
from maopaoBleApp import BleAppService

SEND_INTERVAL_MS = 40

ble = BleAppService("BleSimpleMotion")
message = "WAIT"
connected = False
sensor_ready = False
last_sent_ms = time.ticks_ms()


def on_connect(conn):
    global connected, message
    connected = True
    if sensor_ready:
        message = "CONN"


def on_disconnect(conn, reason):
    global connected, message
    connected = False
    message = "DISC" if sensor_ready else "WAIT"


def update(rt):
    global sensor_ready, message, last_sent_ms

    ble.poll()

    if not sensor_ready:
        if g_sensor.is_ready() != g_sensor.STATUS_OK:
            return
        try:
            g_sensor.get_attitude()
        except RuntimeError:
            return
        sensor_ready = True
        message = "CONN" if connected else "DISC"

    if not ble.ready:
        return

    now_ms = time.ticks_ms()
    if time.ticks_diff(now_ms, last_sent_ms) < SEND_INTERVAL_MS:
        return
    last_sent_ms = now_ms

    try:
        (
            yaw, pitch, roll,
            gx, gy, gz,
            ax, ay, az,
        ) = g_sensor.get_attitude()
    except RuntimeError:
        return

    packet = struct.pack(
        "<6f",
        ax, ay, az,
        gx, gy, gz,
    )
    ble.send_simple_raw(packet)


def draw(rt):
    rt.cls(0)
    x = (rt.width - len(message) * 4) // 2
    rt.text(x, (rt.height - 6) // 2, message, 7)


ble.on_connect(on_connect)
ble.on_disconnect(on_disconnect)

pyxel.init(start_audio=False)
try:
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")
    ble.start()
    pyxel.run(update, draw, fps=50)
finally:
    ble.deinit()
    g_sensor.deinit()
    pyxel.destroy()
