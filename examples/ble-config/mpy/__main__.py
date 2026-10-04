import json
import math
import micropyxel as pyxel
from maopaoBleApp import BleAppService
from display import ConfigDisplay

ble = BleAppService("BleConfig")
display = ConfigDisplay()


def apply_config(path, meta):
    # 接收完成的配置已写入临时文件，JSON 类型会还原为 Python 类型。
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
        # 用 type 避免把 bool 当作 int 接受。
        if type(value) not in types:
            raise ValueError("invalid type for " + key)
        if key == "config1" and not math.isfinite(value):
            raise ValueError("config1 must be finite")
        text = json.dumps(value)
        # 内置字体只显示 ASCII；JSON 表示保留引号、true/false、[] 和 {}。
        if any(ord(char) < 32 or ord(char) > 126 for char in text):
            raise ValueError("use English or pinyin in " + key)
        lines.append(key + ": " + text)

    # 全部字段校验成功后，才替换当前显示。
    display.show(lines)
    return {"items": len(lines)}


ble.config("settings", apply_config)


def update(rt):
    ble.poll()
    # 注册回调不会执行它；此处才应用上传完成的配置。
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
