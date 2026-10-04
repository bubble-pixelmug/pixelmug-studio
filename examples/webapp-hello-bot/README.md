# 第一个 WebApp

一个最小的 WebApp 与 Bot 双向通信示例。Bot 在对话中提供 WebApp 入口；用户在页面中输入名字后，WebApp 向 Bot 发送 `app.hello` 请求并显示返回的问候语。

## 运行

1. 在 Studio 中打开本目录，配置 Bot token 和 API 地址。
2. 启动 Bot，不需要关联设备或运行设备代码。
3. 在冒泡 App 中向 Bot 发送 `/open`。
4. 点击“打开 WebApp”，输入名字并发送问候。

## 文件

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 发送 WebApp 入口并处理 `app.hello` 请求 |
| `webapp/index.html` | 页面结构 |
| `webapp/main.js` | 创建 `BubbleWebApp` 并向 Bot 发起请求 |
| `webapp/style.css` | 页面样式 |

对应文档：[第一个 WebApp](../../../../docs/webapp/quick-start.md)。
