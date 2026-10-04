# BLE Simple 控制示例

这个示例使用 BLE 高速数据通道（Simple），把 WebApp 触摸网格中的坐标实时发送给 PixelMug。

WebApp 显示一个 32 × 16 的网格。左上角坐标是 `(0,0)`，右下角坐标是 `(31,15)`。触摸或拖动时，页面在网格上方显示当前坐标，并通过两个字节发送：

```js
await ble.sendSimpleRaw(new Uint8Array([x, y]));
```

PixelMug 使用 `on_simple()` 接收坐标：

```python
def receive_coordinate(data_type, payload, context):
    if data_type == DATA_TYPE_RAW and len(payload) == 2:
        x = payload[0]
        y = payload[1]

ble.on_simple(receive_coordinate)
```

## 运行

1. 在 Studio 中启动项目并运行 `mpy` 设备代码。
2. 在 Bot 中使用 `/bindPixelMug` 关联设备。
3. 使用 `/webApp` 打开页面。
4. 点击“连接蓝牙”，然后在网格上触摸或拖动。

连接前 PixelMug 显示 `DISC`，连接后显示 `CONN`，收到坐标后显示 `(x,y)`。
