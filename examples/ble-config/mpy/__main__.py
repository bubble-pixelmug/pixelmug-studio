import json
import math
import micropyxel as pyxel
from maopaoBleApp import BleAppService
from display import ConfigDisplay

ble = BleAppService("BleConfig")
display = ConfigDisplay()


def apply_config(path, meta):
    # The completed configuration is stored in a temporary file with JSON types restored.
    with open(path, "r") as source:
        settings = json.load(source)

    if not isinstance(settings, dict):
        raise ValueError("settings must be an object")
    expected = (
        ("config1", (int, float)),
        ("config2", (str,)),
        ("config3", (bool,)),
        ("config4", (list,)),
        ("config5", (dict,)),
    )
    lines = []
    for key, types in expected:
        value = settings.get(key)
        # Use type() so bool is not accepted as an int.
        if type(value) not in types:
            raise ValueError("invalid type for " + key)
        if key == "config1" and not math.isfinite(value):
            raise ValueError("config1 must be finite")
        text = json.dumps(value)
        # The built-in font displays ASCII only; JSON preserves quotes, true/false, [] and {}.
        if any(ord(char) < 32 or ord(char) > 126 for char in text):
            raise ValueError("use English or pinyin in " + key)
        lines.append(key + ": " + text)

    # Replace the current display only after every field passes validation.
    display.show(lines)
    return {"items": len(lines)}


ble.config("settings", apply_config)


def update(rt):
    ble.poll()
    # Registering a callback does not run it; apply completed uploads here.
    ble.process_pending_config(max_items=1)
    display.update(rt)


def draw(rt):
    display.draw(rt)


pyxel.init(start_audio=False)
try:
    ble.start()
    pyxel.run(update, draw, fps=20)
finally:
    ble.deinit()
    pyxel.destroy()
