# Word By

这个示例使用两个设备 slot，每个 slot 默认使用 PixelMug S1，同时兼容 PixelMug P1。

先发送 /bind，按照冒泡 App 的引导关联两个杯子。关联完成后直接发送文字：

- 输入“你好”时，第一个杯子显示“你”，第二个杯子显示“好”。
- 输入“hello world”时，第一个杯子显示“hello”，第二个杯子显示“world”。

输入包含空格时按单词拆分；不包含空格时按 Unicode 字符拆分。示例只取前两个字或单词。