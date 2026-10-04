# WebApp 调用设备 RPC

用户先在 Bot 对话中关联一台 PixelMug S1 或 PixelMug P1，再从对话打开 WebApp。页面获取当前对话关联的设备，通过 `callDevice()` 直接发送 `talSetDisplayOnOff` RPC，控制屏幕打开或关闭。

## 运行

1. 在 Studio 中打开本目录，配置 Bot token 和 API 地址。
2. 启动 Bot，不需要运行设备代码。
3. 在冒泡 App 中发送 `/bind`，关联 PixelMug S1 或 PixelMug P1。
4. 发送 `/open`，点击消息中的按钮打开 WebApp。
5. 点击“Turn on display”或“Turn off display”。

Bot 注册的是 PixelMug S1 slot，并通过 `compatible = ['PixelMug']` 允许关联 PixelMug P1。两个型号都支持 `talSetDisplayOnOff`，所以页面可以使用同一条 RPC。

## 文件

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 注册兼容设备、提供关联入口和 WebApp 入口 |
| `webapp/index.html` | 开屏和关屏按钮 |
| `webapp/main.js` | 使用设备 RPC SDK 构造指令，并直接调用关联设备 |
| `webapp/style.css` | 页面样式 |

对应文档：[快速开始](../../../../docs/webapp/quick-start.md)。
