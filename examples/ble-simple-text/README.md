# BLE Simple 文本示例

这个示例使用 BLE 高速数据通道（Simple），从 WebApp 的虚拟键盘向 PixelMug 发送小写字母。

WebApp 显示 26 个小写字母。每次点击一个字母，立即使用 `sendSimpleText()` 发送：

```js
await ble.sendSimpleText(letter);
```

PixelMug 使用 `on_simple()` 接收，并根据 `DATA_TYPE_TEXT` 解码。屏幕从左向右最多显示 6 个字母；收到第 7 个字母时清屏，并从该字母重新开始：

```python
from maopaoBleApp import DATA_TYPE_TEXT

def receive_text(data_type, payload, context):
    if data_type == DATA_TYPE_TEXT:
        letter = payload.decode("utf-8")

ble.on_simple(receive_text)
```

## 运行

1. 在 Studio 中启动项目并运行 `mpy` 设备代码。
2. 在 Bot 中使用 `/bindPixelMug` 关联设备。
3. 使用 `/webApp` 打开页面。
4. 点击“连接蓝牙”，连接成功后依次点击字母键。

连接前 PixelMug 显示 `DISC`，连接后显示 `CONN`，随后逐个显示收到的字母。
