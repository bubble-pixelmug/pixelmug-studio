# Minimal MPS

这是一个包含 Bot、WebApp 和 MPY 的最小冒泡智能体应用，用于验证 Studio 的完整运行流程。

## 目录

```text
bot/index.js       冒泡 Bot 入口
webapp/            WebApp 页面
mpy/__main__.py    PixelMug 代码入口
mpy/mps.json       MPY 配置
mpy/message.txt    文件上传示例资源
```

`mpy/dist/` 用于验证部署忽略规则，不会上传到设备。

## 运行

1. 启动 PixelMug Studio。
2. 在“选择应用”中打开本目录。
3. 将 Bot 入口设置为 `bot/index.js`，并填写 Bot token。
4. 在冒泡 App 中与 Bot 交互并完成设备绑定。
5. 启动智能体。可以由应用触发 MPY 加载，也可以开启 Studio 的自动运行设备代码选项。

Bot 支持以下测试命令：

- `/bind`：显示设备绑定入口。
- `/devices`：查看当前绑定设备。
- `/webapp`：打开 WebApp。
- `/run`：通过应用流程加载并运行第一台绑定设备。
- `/run <deviceId>`：运行指定设备。
- `/runasync`：验证异步设备调用。

MPY 示例使用 `micropyxel`，运行后会显示简单画面并持续输出心跳日志。接口用法以 PixelMug 仓库的 `mps/mpy-examples` 为准。

每轮运行记录保存在本目录的 `debug/<runId>/`，该目录已被 Studio 仓库忽略。
