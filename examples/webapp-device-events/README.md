# WebApp 接收设备事件

一个最小的设备事件示例。页面获取当前对话关联的 PixelMug S1，订阅或取消订阅设备事件，并显示充电状态变化。设备关联改变后，页面会更新目标设备；如果此前已经订阅，还会自动订阅新设备。

## 运行

1. 在 Studio 中打开本目录，配置 Bot token 和 API 地址。
2. 启动 Bot，不需要运行设备代码。
3. 在冒泡 App 中发送 `/bind`，关联一台 PixelMug S1。
4. 发送 `/open`，打开 WebApp。
5. 点击“订阅事件”，再连接或断开充电电源。
6. 点击“取消订阅”后，页面不再接收新的充电事件。

保持页面打开并重新关联设备，可以验证 `onDevicesChanged()`。

## 文件

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 注册 PixelMug S1，并提供关联入口和 WebApp 入口 |
| `webapp/index.html` | 设备、订阅和充电状态界面 |
| `webapp/main.js` | 查询设备、管理订阅并解析充电事件 |
| `webapp/style.css` | 页面样式 |

对应文档：[接收设备主动上报事件](../../../../docs/webapp/device-events.md)。
