# Pixel Text Share

用户在 WebApp 中选择一台 PixelMug 并发送文字。设备显示成功后，Bot 观察这次 WebApp 设备调用，并在当前对话中发送“哪个用户给哪个水杯发送了什么文字”。

Bot 声明两个 PixelMug S1 slot，两个位置都兼容 PixelMug P1。WebApp 允许没有设备的群成员打开，并读取当前群聊已经关联的设备；发送文字前，群聊中至少需要关联一台设备。

## 运行

1. 在 Studio 中打开本目录，配置 Bot token 和 API 地址。
2. 启动 Bot，不需要运行设备代码。
3. 在冒泡 App 中发送 `/bind`，关联一台或两台 S1/P1。
4. 发送 `/open`，打开 WebApp。
5. 输入文字，选择颜色、字体、滚动方向和目标杯子，然后点击“发送”。

设备执行成功后，Bot 会在当前单聊或群聊中发送操作记录。

## 文件

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 声明两个设备位置、观察 WebApp 设备调用并发送聊天消息 |
| `webapp/index.html` | 文字设置和目标设备选择 |
| `webapp/main.js` | 获取关联设备、构造文字 RPC 并调用选中的设备 |
| `webapp/style.css` | 页面样式 |

对应文档：[观察 WebApp 发起的设备调用](../../../../docs/webapp/observe-device-calls.md)。
