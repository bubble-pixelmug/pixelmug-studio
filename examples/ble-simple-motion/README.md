# BLE Simple 运动数据示例

这个示例通过 BLE 高速数据通道，把 PixelMug 的加速度和角速度实时发送到 WebApp。

WebApp 只包含连接按钮和六个实时变化的数值：

- `ax`、`ay`、`az`：三轴加速度，单位为 `g`
- `gx`、`gy`、`gz`：三轴角速度，单位为 `°/s`

## 数据格式

设备端每隔 40 ms 读取一次 G-sensor，并使用 `send_simple_raw()` 发送一个 24 字节的数据包。数据包由六个小端序 `float32` 组成：

| 字节偏移 | 数据 | 单位 |
| --- | --- | --- |
| 0 | `ax` | `g` |
| 4 | `ay` | `g` |
| 8 | `az` | `g` |
| 12 | `gx` | `°/s` |
| 16 | `gy` | `°/s` |
| 20 | `gz` | `°/s` |

设备端把六个数值编码为 RAW 数据：

```python
packet = struct.pack("<6f", ax, ay, az, gx, gy, gz)
ble.send_simple_raw(packet)
```

WebApp 通过 `simpleData` 接收数据，再按相同顺序解析：

```js
ble.on('simpleData', (data) => {
  if (data.dataType !== 0 || data.bytes.byteLength !== 24) return

  const view = new DataView(
    data.bytes.buffer,
    data.bytes.byteOffset,
    data.bytes.byteLength,
  )

  const ax = view.getFloat32(0, true)
  const ay = view.getFloat32(4, true)
  const az = view.getFloat32(8, true)
  const gx = view.getFloat32(12, true)
  const gy = view.getFloat32(16, true)
  const gz = view.getFloat32(20, true)
})
```

`true` 表示按小端序读取，与设备端的 `<6f` 对应。运动数据具有实时性；如果发送队列忙，本例直接丢弃当前采样，不会稍后重发旧数据。

## 运行示例

1. 发布 `bot` 和 `webapp`。
2. 把 `mpy` 安装并运行在 PixelMug 上。
3. 在冒泡 App 中绑定 PixelMug，然后打开 WebApp。
4. 点击“连接蓝牙”，观察六个数值随 PixelMug 的运动实时变化。

PixelMug 屏幕会显示当前状态：`WAIT` 表示等待传感器就绪，`DISC` 表示蓝牙未连接，`CONN` 表示蓝牙已连接。
