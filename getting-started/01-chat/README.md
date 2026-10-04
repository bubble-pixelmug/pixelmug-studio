# 01 · 通过对话与 PixelMug 交互

给 Bot 发“你好”，PixelMug 显示“你好”，Bot 回复“杯子收到啦：你好”。支持 P1 和 S1 系列，不需要 MPY。

## 运行

1. 在 Studio 打开本目录，Bot 入口选择 `bot/index.js`，填写 token。
2. 点击“启动智能体”，在关联设备卡片中选择一个在线的 PixelMug。
3. 在冒泡 App 中私聊你的 Bot，直接发送“你好”。不要输入带命令前缀的文字。
4. 看杯子的文字，再看 Bot 的回复。也可以发送自己的名字或一句短消息。

未关联时，Bot 会给出关联卡片。一次只运行一个使用该 token 的 Bot。

## 改一个地方

打开 `bot/index.js`，把 `color: '#00ff00'` 改成 `color: '#ff8800'`，保存并重启智能体，再发一句话，观察颜色变化。

## 刚才发生了什么？

用户消息 → Bot 读取文字 → SDK 构造 TAL 显示指令 → 设备执行 → Bot 回复结果。

`registerDevices()` 声明需要 PixelMug 接口，`compatible` 允许关联 PixelMugS1。`talPrintText()` 负责文字转换，`callDevice()` 等待设备执行结果。整个项目的业务代码都在这一个文件中。
