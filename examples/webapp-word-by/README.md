# WebApp Word By

这个示例使用两个设备 slot，每个 slot 默认使用 PixelMug S1，同时兼容 PixelMug P1。只有两个 slot 都关联设备后，WebApp 才能打开。

页面按以下规则拆分输入：

- 输入“你好”时，第一个杯子显示“你”，第二个杯子显示“好”。
- 输入“hello world”时，第一个杯子显示“hello”，第二个杯子显示“world”。

每个杯子可以分别选择字体大小以及红、绿、蓝三种颜色。文字使用静止显示，不会滚动。

## 运行

1. 在 Studio 中打开本目录，配置 Bot token 和 API 地址。
2. 启动 Bot，不需要运行设备代码。
3. 在冒泡 App 中发送 `/bind`，为两个 slot 分别关联 S1 或 P1。
4. 发送 `/open`，打开 WebApp。
5. 输入两个字或两个单词，设置两台设备的字体和颜色，然后点击“显示”。

## 文件

| 文件 | 内容 |
| --- | --- |
| `bot/index.js` | 声明两个兼容设备 slot，并提供关联入口和 WebApp 入口 |
| `webapp/index.html` | 输入框和两台设备的显示设置 |
| `webapp/main.js` | 拆分文字、构造 RPC 并调用两台设备 |
| `webapp/style.css` | 页面样式 |
