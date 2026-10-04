import bluetooth
import json
import micropyxel as pyxel
from maopaoBleApp import AUTH_MODE_NONE, BleAppService

APP_ID = "BleCustomClientLib"
WIDTH = 32
HEIGHT = 16
MIN_RADIUS = 2
MAX_RADIUS = 7

ble = BleAppService(APP_ID)
status = "DISC"
configured = False
circle_color = 10
radius_step = 1
circle_steps = 6
step_index = 0
visible_radius = None


def apply_circle_config(path, meta):
    global configured, circle_color, radius_step, circle_steps
    global step_index, visible_radius, status

    with open(path, "r") as source:
        value = json.load(source)

    next_color = int(value["color"])
    next_step = int(value["step"])
    next_steps = int(value["steps"])
    largest_radius = MIN_RADIUS + next_step * (next_steps - 1)

    if not 0 <= next_color <= 15:
        raise ValueError("color must be 0..15")
    if next_step < 1:
        raise ValueError("step must be at least 1")
    if next_steps < 1:
        raise ValueError("steps must be at least 1")
    if largest_radius > MAX_RADIUS:
        raise ValueError("largest radius must not exceed %d" % MAX_RADIUS)

    circle_color = next_color
    radius_step = next_step
    circle_steps = next_steps
    step_index = 0
    visible_radius = None
    configured = True
    status = "CONFIG DONE"

    print("Circle config received:", {
        "color": circle_color,
        "step": radius_step,
        "steps": circle_steps,
    })
    return {
        "color": circle_color,
        "step": radius_step,
        "steps": circle_steps,
    }


def next_circle(params, context):
    global step_index, visible_radius
    if not configured:
        raise RuntimeError("circle config is not ready")

    visible_radius = MIN_RADIUS + radius_step * step_index
    step_index = (step_index + 1) % circle_steps
    return {
        "radius": visible_radius,
        "color": circle_color,
        "nextRadius": MIN_RADIUS + radius_step * step_index,
    }


def on_connect(conn):
    global status, visible_radius
    status = "CONN"
    visible_radius = None
    print("[BLE] connected")


def on_ready(conn, session_id):
    global status
    status = "READY"


def on_disconnect(conn, reason):
    global status, visible_radius
    status = "DISC"
    visible_radius = None
    print("[BLE] disconnected")


def update(rt):
    ble.poll()
    ble.process_pending_config(max_items=1)


def draw(rt):
    rt.cls(0)
    if visible_radius is not None:
        rt.circb(WIDTH // 2, HEIGHT // 2, visible_radius, circle_color)
    elif status == "CONFIG DONE":
        rt.text(4, 1, "CONFIG", 11)
        rt.text(8, 9, "DONE", 11)
    else:
        x = (WIDTH - len(status) * 4) // 2
        rt.text(x, (HEIGHT - 6) // 2, status, 11)


ble.config("circle", apply_circle_config)
ble.command("nextCircle", next_circle)
ble.on_connect(on_connect)
ble.on_ready(on_ready)
ble.on_disconnect(on_disconnect)
ble.on_error(lambda error: print("[BLE]", error))

pyxel.init(start_audio=False)
try:
    ble.start(auth_mode=AUTH_MODE_NONE)
    _, mac = bluetooth.BLE().config("mac")
    print("PixelMug BLE MAC:", ":".join("%02X" % b for b in mac))
    pyxel.run(update, draw, fps=20)
finally:
    ble.deinit()
    pyxel.destroy()