# Studio 日志 demo

业务代码只写 console。此示例包含：

- `bot/smoke-bot.js`：无需 token 的 Node 日志通道测试，不模拟冒泡 API。
- `bot/index.js`：真实 bot；接收 `/webapp` 并提供 `studio.echo` 成功/失败请求。
- `webapp/`：运行在冒泡 WebView 中，测试 console、未处理异常及真实 bot 请求。

首次从 PixelMug 项目根目录执行 `npm --prefix tools/studio ci` 和 `npm --prefix mps/jeejio-bubble ci`。

从 PixelMug 项目根目录启动，把 IP 换成电脑局域网地址：

```sh
node tools/studio/server.mjs --project tools/studio/examples/studio-debug --bot bot/smoke-bot.js --host 192.168.1.100
```

PC 打开终端的 Studio 地址；另开 WebApp 地址点击按钮，即可先验证日志通道。程序不依赖冒泡 token 或硬件。

真实 bot 测试需先在 `mps/jeejio-bubble` 执行 `npm ci`，并在同一终端设置 `BOT_TOKEN` 后将 `--bot bot/smoke-bot.js` 改为 `--bot bot/index.js`。如需要，另设 `BOT_API_BASE_URL`。在冒泡 App 发送 `/webapp`，点击 bot 返回的按钮。

WebApp 使用真 JeeWeb bridge，没有 bridge 时只允许浏览器日志测试，禁用 bot 请求按钮。请求 payload 里的 requestId 会由两端主动打印，便于对照同一次请求。

本轮记录存入本目录的 `debug/<runId>/`，不纳入 Git。每次重启接收程序需要重新获取 WebApp 链接。

[详细启动、接入及验收说明](../../README.md) · [Studio 日志接入](../../STUDIO-DEBUG.md)

也可以在 `tools/studio` 目录运行：

```sh
npm run example:studio -- --host 192.168.1.100
# 设置 BOT_TOKEN 后启动真实 bot
npm run example:studio:bot -- --host 192.168.1.100
```

这两个脚本属于 Studio，不再放在 jeejio-bubble 的 package.json 中。
