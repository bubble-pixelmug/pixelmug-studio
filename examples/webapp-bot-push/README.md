# Bot 向 WebApp 推送

一个最小的 Bot 主动推送示例。WebApp 发起 `app.startTask` 请求，Bot 使用 `ctx.sendWebAppData()` 向当前页面推送进度，页面通过 `webapp.on()` 接收，最后显示请求的返回结果。

## 运行

1. 在 Studio 中打开本目录，配置 Bot token 和 API 地址。
2. 启动 Bot，不需要关联设备或运行设备代码。
3. 在冒泡 App 中向 Bot 发送 `/open`。
4. 打开 WebApp，点击“开始任务”。

## 文件

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 提供 WebApp 入口，处理请求并推送进度 |
| `webapp/index.html` | 页面结构 |
| `webapp/main.js` | 发起请求并接收 Bot 推送 |
| `webapp/style.css` | 页面样式 |

对应文档：[Bot 主动向 WebApp 推送](../../../../docs/webapp/push.md)。
