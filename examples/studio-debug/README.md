# Studio Debug 示例

这个示例用于验证 Bot 和 WebApp 的日志采集。

- `bot/smoke-bot.js`：无需冒泡 token 的本地 Node 日志测试。
- `bot/index.js`：连接冒泡服务的真实 Bot。
- `webapp/`：输出普通日志、异常和请求日志的测试页面。

## 本地日志测试

在 `tools/studio` 目录执行：

```sh
npm run example:studio
```

打开终端输出的 Studio 和 WebApp 地址，可以先验证日志采集与筛选，不依赖冒泡账号或硬件。

## 真实 Bot 测试

设置 `BOT_TOKEN` 后执行：

```sh
npm run example:studio:bot
```

在冒泡 App 中向 Bot 发送 `/webapp`，打开返回的页面，观察 Studio 中的 Bot 和 WebApp 日志。

运行记录保存在本目录的 `debug/<runId>/`，该目录已被 Studio 仓库忽略。
