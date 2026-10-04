# BLE 最小示例

一个完整的 Bot + WebApp + MPY 教学项目，对应设备文档的最小 BLE 示例。适用于 PixelMug S1 Pro/Lite。

## 运行

1. 在 Studio 打开本目录，选择 Bot 入口 `bot/index.js` 并填写 token。
2. 勾选“启动后自动运行设备代码”，启动智能体。
3. 在冒泡 App 向 Bot 发送 `/bindPixelMug`，关联一台 PixelMug。也可在 Studio 关联。
4. 等待设备代码运行，杯子显示 `DISC`。
5. 发送 `/webApp` 打开页面，点击“连接”（使用第一台已关联设备），杯子显示 `CONN`。
6. 点击“echo”，杯子居中显示 `echo`。
7. 点击“断开”，等杯子恢复 `DISC` 后，再点击“重连”，杯子显示 `CONN`。

`/help` 随时查看操作说明。WebApp 只负责通信，MPY 由 Studio 部署和运行。手机需要能访问 Studio 提供的页面地址，并靠近 PixelMug、允许蓝牙权限。

## 文件与 API

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 绑定设备、help、打开 WebApp 三个命令 |
| `webapp/main.js` | getDevices、connect、reconnect、command 四个核心调用 |
| `webapp/index.html`、`style.css` | 连接、断开、重连、echo 四个按钮 |
| `mpy/__main__.py` | BleAppService 回调、命令注册、poll、disconnect；MicroPyxel 绘图 |
| `mpy/mps.json` | 声明 MicroPyxel 依赖 |

两端应用标识均为 `BleMinimal`，修改时要同步。设备默认使用冒泡鉴权，页面通过 SDK 和原生桥接处理连接、鉴权及 F150 加解密。

echo 回调返回 `{"text":"echo"}`，本页只发送命令，不展示返回值。需要读取结果时，可将调用写为 `const response = await ble.command("echo", { text: "echo" })`，再访问 `response.result.text`。设备显示 echo 后保持，直到断开或重新连接。

屏幕居中静态显示 DISC（未连接）、CONN（已连接）或 echo（收到命令），每种文字均可在一屏内完整显示。

## 断开与重连

当前 JavaScript SDK 没有公开原生 BLE disconnect 方法，`BleAppClient.close()` 只清理监听和计时器。

本项目注册一个名为 `disconnect` 的应用命令：设备先提交响应，主循环再等待 200 ms，调用新增的 `BleAppService.disconnect()` 真正断开物理连接。页面不显示连接状态，请观察杯子的 DISC / CONN / echo。

需要包含 `BleAppService.disconnect()` 的更新固件；Studio 上传 MPY 不会更新固件内置模块。断开只能在应用已就绪时通过此命令发起。响应可能因断连而丢失，是否断开以杯子显示 DISC 为准。

“重连”直接调用 SDK 的 reconnect()，需要此前已点击过“连接”。该方法不保证先切断已有物理链路；本例按“断开 → 等待 DISC → 重连”的顺序操作。关闭页面只清理页面资源，不保证物理链路随即断开，退出前可先点击“断开”。

## 对应文档

- [BLE 入门](../../../../docs/ble/index.md)
- [连接与生命周期](../../../../docs/ble/app/mpy/connection.md)
- [命令与响应](../../../../docs/ble/app/mpy/commands.md)

本项目只演示连接和命令请求，不包含状态同步、实时控制、Simple 或配置上传。为便于初学者阅读，页面省略了设备选择、连接状态、错误展示和操作锁；请先绑定设备，在冒泡 App 中打开，并按上述步骤逐个操作按钮。
