# BLE 状态与事件

一个 Bot + WebApp + MPY 完整教学项目，适用于 PixelMug S1 Pro/Lite。MPY 从 0 开始，每隔约一秒加一，到 99 后回到 0。杯子和网页显示同一个计数，网页另外保留最近一次事件。

## 运行

1. 在 Studio 打开本目录，选择 `bot/index.js`，填写 Bot token。
2. 勾选“启动后自动运行设备代码”，启动智能体。
3. 在冒泡 App 发送 `/bindPixelMug` 关联杯子，等待 MPY 开始显示计数。
4. 发送 `/webApp` 打开页面，点击“连接”。页面使用第一台已关联设备。
5. 观察网页数字每秒更新；点击“读取当前值”可主动读取一次。
6. 计数到 10、20…90 时，事件区域显示“计数到达 N”；99 回到 0 时显示“计数归零，开始新一轮”。

`/help` 可查看操作说明。页面需要在冒泡 App 中打开，手机需能访问 Studio 的页面地址并允许蓝牙权限。两端应用标识均为 `BleEventState`，修改时需保持一致。

## 只看这几组 API

| 用途 | MPY | WebApp |
| --- | --- | --- |
| 定义可读取的状态 | `ble.set_state_provider(read_state)`，返回 `{"count": count}` | `await client.requestSnapshot()`，得到 `{ count: 当前值 }` |
| 主动推送状态 | `ble.publish_state()` | `client.on('state', showCount)` |
| 整十事件 | `ble.send_event("multipleOfTen", {"count": count})` | 在 `client.on('event', ...)` 中检查 `event.event`，读取 `event.count` |
| 重新计数事件 | `ble.send_event("counterReset", {"count": 0})` | 同一个事件监听中处理 `counterReset` |

状态是“现在是多少”，事件是“刚发生了什么”。例如到 20 时，设备既发布状态 `{"count": 20}`，也发送一次 `multipleOfTen` 事件；到 21 时只发布状态，网页的事件区域继续显示最近一次通知。

0 只触发重置事件，不同时触发整十事件。程序刚启动时不发送重置事件，第一次重置发生在计数完成一轮之后。

## 连接与数据行为

计数不依赖网页连接，断开时也会继续。MPY 只有在 `ble.ready` 时发布状态和事件，并在每次画面更新中调用 `ble.poll()` 推进通信。

网页在连接前注册监听，连接后主动读取当前状态，因此可能首次看到 7、15 等数值，而不是 0。`requestSnapshot()` 只读取，不会重置计数。没有连接时发生的事件不补发，重新连接后仍可取得当前计数。

本例只保留连接、读状态和收通知的代码，不添加应用命令或断开流程；主动断开的写法见 [ble-minimal](../ble-minimal/README.md)。`client.close()` 清理页面监听，不代表物理 BLE 连接已断开。

状态和事件通过标准消息通道传输，不逐条等待网页业务确认。状态用于显示最新值，不是保存每次计数的历史记录。

## 文件

- `mpy/__main__.py`：计数、定义状态、发布状态和事件、居中显示。
- `webapp/main.js`：连接、读取状态、监听状态与事件。
- `webapp/index.html`、`style.css`：两个按钮、一个计数和一条事件提示。
- `bot/index.js`：绑定设备、帮助和打开页面。

## 对应文档

- [WebApp SDK BLE 接口](../../../../docs/ble/app/webapp.md)
- [MPY 状态与事件](../../../../docs/ble/app/mpy/state-events.md)

本例使用固件内置的 `maopaoBleApp`；`mps.json` 只声明 MicroPyxel 显示组件依赖。
