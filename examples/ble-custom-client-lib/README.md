# 开放 BLE：按键控制圆形

本例演示 ESP32-C3 如何通过 `PixelMugBLECentral` 配置并控制 PixelMug。C3 与 PixelMug 建立应用会话后，先上传圆形颜色、半径步长和循环步数；PixelMug 应用配置成功后显示 `CONFIG DONE`。之后每按一次连接到 GPIO9 的按键，C3 就发送一次 `nextCircle` 命令，杯子绘制下一个空心圆。

默认配置为颜色 `10`、半径步长 `1`、循环 `6` 步，因此按键对应的半径依次为：

```text
2 → 3 → 4 → 5 → 6 → 7 → 2 → …
```

这个流程分别展示两类接口：配置传输适合在运行前下发一组参数，控制命令适合处理每次按键触发的即时操作。

## 文件

```text
ble-custom-client-lib/
├── bot/
│   └── index.js
├── mpy/
│   ├── __main__.py       接收配置并按命令绘制空心圆
│   └── mps.json
└── custom-client-c3/
    ├── BLECentral/
    │   ├── PixelMugBLECentral.h
    │   └── PixelMugBLECentral.cpp
    ├── CMakeLists.txt
    ├── sdkconfig.defaults
    └── main/
        ├── CMakeLists.txt
        ├── idf_component.yml
        └── main.cpp      配置上传与 GPIO9 按键控制
```

C3 工程使用 ESP-IDF 5.5.x 和 esp-nimble-cpp 2.5.0。`idf_component.yml` 会在首次构建时下载 esp-nimble-cpp。

## 硬件连接

按键连接在 GPIO9 与 GND 之间，程序启用 GPIO9 的内部上拉：

```text
GPIO9 ── 按键 ── GND
```

按下时 GPIO9 变为低电平。GPIO9 也是 ESP32-C3 常用的启动配置引脚，复位或上电时不要按住按键，以免开发板进入下载模式。

## 1. 运行 PixelMug 应用

在 Studio 中启动项目，在冒泡 App 中向 Bot 发送 `/bind` 并关联 PixelMug。Studio 会把 `mpy/` 应用安装到杯子。应用使用开放连接模式，并在串口打印 BLE MAC：

```text
PixelMug BLE MAC: AA:BB:CC:DD:EE:FF
```

附近有多台 PixelMug 时，把这个地址填写到 `custom-client-c3/main/main.cpp` 的 `TARGET_ADDRESS`。省略地址只适用于扫描范围内仅有一台符合条件的 PixelMug。

## 2. 配置圆形参数

C3 连接并完成 hello 后，调用：

```cpp
mug.setConfigJson(
    "circle",
    R"({"color":10,"step":1,"steps":6})"
);
```

配置字段为：

| 字段 | 含义 |
| --- | --- |
| `color` | MicroPyxel 颜色值，范围 0～15 |
| `step` | 每次按键后，下一步增加的半径 |
| `steps` | 一个循环包含的圆形数量 |

半径从 2 开始。配置必须满足 `2 + step × (steps - 1) <= 7`，保证圆形完整显示在 32 × 16 屏幕内。

`setConfigJson()` 成功只表示配置已提交。C3 继续等待 `configApplied` 事件；MPY 的配置处理函数会校验参数、通过 `print` 输出收到的配置，并在屏幕显示：

```text
CONFIG
 DONE
```

## 3. 按键发送控制命令

配置应用成功后，C3 轮询 GPIO9。每次确认按键由高电平变为低电平，就发送：

```cpp
mug.command("nextCircle", "{}");
```

`nextCircle` 不需要重复携带颜色、步长和步数。MPY 使用已应用的配置计算本次半径、绘制空心圆，并返回本次半径、颜色和下一次半径。达到配置的步数后，下一次按键重新从半径 2 开始。

C3 对按下和释放都做了简单消抖；长按只触发一次命令，需要松开后再次按下才会绘制下一个圆。

## 4. 编译和烧录 C3

在已经配置 ESP-IDF 5.5.x 的终端中：

```sh
cd tools/studio/examples/ble-custom-client-lib/custom-client-c3
idf.py set-target esp32c3
idf.py build
idf.py -p COM7 flash monitor
```

将 `COM7` 换成开发板实际端口。测试时断开冒泡 App 或其它 BLE 中心设备与目标 PixelMug 的连接，然后复位 C3。程序完成配置后会输出提示，此时可以开始按 GPIO9 按键。

## PixelMugBLECentral

`BLECentral/PixelMugBLECentral.h` 和 `.cpp` 封装了扫描与连接、MTU、服务发现、通知订阅、hello/session、命令响应、配置分块和 Simple 分包。当前实现面向 ESP-IDF 与 esp-nimble-cpp，也可以作为 Arduino、桌面端或移动端 BLE 主机实现的移植参考。

协议和移植说明见[自定义 BLE 主机文档](../../../../docs/ble/custom-client.md)。

## ESP-IDF 5.5 的通知接收配置

当前 ESP-IDF 5.5 的 NimBLE 将 ATT 通知接收入口放在 GATT Server 的编译条件下。即使应用只作为 Central，也需要保留：

```ini
CONFIG_BT_NIMBLE_ROLE_PERIPHERAL=y
CONFIG_BT_NIMBLE_ROLE_BROADCASTER=y
CONFIG_BT_NIMBLE_GATT_SERVER=y
```

这只启用编译支持，不会自动启动广播或改变示例的 Central 工作方式。关闭它们可能导致连接、读写和订阅均成功，但始终收不到 hello 响应。示例已在 `sdkconfig.defaults` 中保留这些选项；已有工程还需检查 `sdkconfig`，仅修改 defaults 不会覆盖已有配置。

当前 esp-nimble-cpp 2.5.0 在开启 Peripheral、关闭 Broadcaster 时存在条件编译不一致，会报 `m_advertiseOnDisconnect` 未声明。因此也保留 Broadcaster 编译支持；只有显式调用启动广播的接口才会开始广播。
