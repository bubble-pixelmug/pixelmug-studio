# 开放 BLE：ESP32-C3 发送数字

PixelMug 运行 MPY 作为 BLE 外设，ESP32-C3 运行 ESP-IDF C++ 固件作为中心设备。C3 连接后每隔一秒发送一个数字，依次为 0～9，然后主动断开。

```text
PixelMug: DISC → CONN → 0 → 1 → … → 9 → DISC
ESP32-C3: 扫描 → 连接 → 发现服务 → 每秒发送 → 断开并停止
```

这轮只执行一次，C3 复位后重新开始。连接前扫描失败或连接失败会重试；已经建立连接后遇到断连或错误则停止，方便观察结果。

ESP32-C3 端只提供 ESP-IDF 工程，不需要 Arduino IDE。工程使用 esp-nimble-cpp 封装 BLE 初始化、扫描、连接、服务发现和特征写入，业务代码可以按顺序组织流程，无需直接处理 NimBLE 的 GAP/GATT 回调、发现状态和属性句柄。

## 文件

```text
ble-custom-client/
├── bot/
│   └── index.js               Studio 使用的最小 Bot 入口
├── mpy/
│   ├── __main__.py            杯子接收数字并显示
│   └── mps.json               MicroPyxel 依赖
└── custom-client-c3/
    ├── CMakeLists.txt
    ├── sdkconfig.defaults     启用 NimBLE Central 与扫描角色
    └── main/
        ├── CMakeLists.txt
        ├── idf_component.yml  声明 esp-nimble-cpp 依赖
        └── main.cpp           扫描、连接、发现 F161、发送数字、断开
```

`bot/index.js` 注册一个 PixelMug S1 设备位置，并提供 `/bind` 和 `/help` 命令。用户通过 Bot 关联测试用的杯子后，Studio 才能识别目标设备，并安装、运行 `mpy/` 中的脚本。实际 BLE 数据仍由 ESP32-C3 直接与 PixelMug 通信，不经过 Bot、WebApp 或冒泡 App。两块设备只需各自供电，无需连接 GPIO 或接入同一个 Wi-Fi。

## 1. 运行 PixelMug 程序

在 Studio 中启动项目，然后在冒泡 App 中向 Bot 发送 `/bind`，选择一台 PixelMug S1 Pro/Lite。此项目包含 `mpy/`，Studio 默认勾选自动运行设备代码，会将脚本安装到关联的杯子并运行；也可以使用已有的 MPY 部署流程。确认杯子显示 `DISC` 后，再启动 C3。

固件需提供 `maopaoBleApp` 的 `AUTH_MODE_NONE`、`DATA_TYPE_RAW`、`on_simple()` 和 MicroPyxel。BLE 组件随固件提供；`mps.json` 只声明显示组件。上传 MPY 不会更新固件内置模块。

关键代码：

```python
ble = BleAppService("BleCustomClient")
ble.on_simple(on_number)
ble.start(auth_mode=AUTH_MODE_NONE)
```

`AUTH_MODE_NONE` 关闭冒泡鉴权。`on_number(data_type, payload, context)` 只接受一个值为 0～9 的 RAW 字节。`ble.poll()` 放在屏幕 update 回调中，接收后更新文字，draw 回调居中静态显示。

本例不需要设备端 `disconnect()` 方法，断开由 C3 发起。

## 2. 编译 ESP32-C3 固件

工程面向 ESP-IDF 5.5.x，使用 **esp-nimble-cpp 2.5.0** 封装 IDF 内置 NimBLE。这是 C3 端唯一的实现；示例通过 C++ 接口完成常规 BLE 操作，只在业务代码中选择设备、构造 Simple 数据包并控制发送顺序。

依赖已写入 `main/idf_component.yml`；ESP-IDF 组件管理器会在首次配置或构建时下载到 `managed_components`，首次运行需要联网，无需手动克隆库。`main/CMakeLists.txt` 通过 `REQUIRES h2zero__esp-nimble-cpp` 声明编译依赖。

在已激活 ESP-IDF 环境的终端中：

```sh
cd tools/studio/examples/ble-custom-client/custom-client-c3
idf.py set-target esp32c3
idf.py build
idf.py -p COM7 flash monitor
```

将 COM7 换成 C3 实际串口；Linux/macOS 使用对应设备路径。烧录对象是 C3，不是 PixelMug。退出串口监视器使用 Ctrl+]。

不依赖开发板 LED、按钮 GPIO 或额外接线；默认串口输出日志。电脑上选择与开发板实际连接相符的烧录端口即可。

## 3. 选择杯子

未填写目标地址时，C3 只会在扫描结果中仅有一台 PixelMug 时自动连接。扫描到多台杯子会停止并提示填写 `TARGET_ADDRESS`，避免因扫描顺序变化而连接错误的设备。

目标 MPY 启动时会打印 `PixelMug BLE MAC`。附近有多台杯子时，将这个地址填写到 `custom-client-c3/main/main.cpp` 顶部：

```cpp
static const char* TARGET_ADDRESS = "AA:BB:CC:DD:EE:FF";
```

扫描日志会列出名称以 `MPY-` 开头且广播 F160 服务的设备地址，并单独输出最终连接的地址。留空只允许自动选择唯一候选；修改后需要重新编译烧录。

筛选依据是 `MPY-` 扫描响应名称和 F160 服务，不会验证 MPY 的 `app_id`，也不能判断目标是否启用了鉴权。因此必须先在目标杯子运行这里的开放模式 MPY；若误连到冒泡鉴权模式的应用，C3 的提交日志不代表数据被应用接受。

## 4. 观察结果

C3 日志大致为：

```text
Scanning for PixelMug F160...
Found PixelMug AA:BB:CC:DD:EE:FF
Connecting to AA:BB:CC:DD:EE:FF
Connected. Discovering F160.
F161 ready. Sending 0..9, one number per second.
Write queued: 0
Write queued: 1
...
Write queued: 9
Finished. Press RESET to repeat.
```

GATT 服务发现完成后先等待一秒，让杯子显示 `CONN`。之后每秒提交一个数字；提交 9 后再等待一秒，调用 `client->disconnect()` 断开。杯子收到断开事件后恢复 `DISC`，C3 不再自动扫描，按复位键即可重跑。

## 用到的协议与接口

本例采用 **开放连接模式 + 高速数据通道（F160，Simple）**。这一组合不要求冒泡鉴权或 F150 hello，数字数据也不加密。

| C3 操作 | esp-nimble-cpp 接口 | PixelMug 对应行为 |
| --- | --- | --- |
| 扫描广播 | `scan->getResults(3000)` | `ble.start(auth_mode=AUTH_MODE_NONE)` 启动广播 |
| 连接 | `client->connect(device)` | `on_connect()` 显示 CONN |
| 查找服务／特征 | `getService("F160")`、`getCharacteristic("F161")` | 提供 F160 服务和 F161 写入特征 |
| 发送数字 | `characteristic->writeValue(packet, sizeof(packet), false)` | Simple 重组后由 `on_simple()` 回调接收 |
| 主动断开 | `client->disconnect()` | `on_disconnect()` 显示 DISC |

C3 每次向 F161 写入 7 字节，前 6 字节是 Simple 包头：

```text
01 00 00 10 00 01 NN
│  │  │  │  └───┘ └─ 数字字节：00..09
│  │  │  │   总负载长度 = 1
│  │  │  └─ 共 1 包，第 0 包
│  │  └─ RAW 类型
│  └─ flags = 0
└─ version = 1
```

例如发送数字 9 为 `01 00 00 10 00 01 09`。负载是二进制值，不是 ASCII 字符 '9' 的 0x39。每包只有 7 字节，默认 MTU=23 已足够，无需额外 MTU 协商。

这是单向演示，不订阅 F162 通知，也不增加应用确认。日志 `Write queued` 表示 C3 已将无响应写入交给本地 BLE 栈，不能证明杯子应用已经收到或显示；正常连接下观察杯子应依次看到全部数字。需要业务确认时，可以扩展 Simple 回传协议，或使用标准消息通道的请求／响应。

## 实现说明

`app_main()` 中依次执行扫描、连接、服务发现、发送和断开。esp-nimble-cpp 负责 NVS、BLE 控制器、NimBLE host 任务及常规 GAP/GATT 交互；示例无需自行实现底层回调或管理属性句柄。`getResults(3000)` 等待三秒扫描完成，`connect()` 等待连接结果；发送间隔使用 `vTaskDelay()`，让出 CPU 给 BLE 任务。

## 参考

- [设备 BLE 文档](../../../../docs/ble/index.md)
- [开放终端接入协议](../../../../docs/ble/custom-client.md)
- [esp-nimble-cpp 2.5.0 组件](https://components.espressif.com/components/h2zero/esp-nimble-cpp/versions/2.5.0/readme)
