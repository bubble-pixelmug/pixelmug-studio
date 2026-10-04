# 三个小项目，认识 Bubble

按顺序打开下面三个项目，每次只多学一种能力。项目放在 Studio 内，使用 Studio 已安装的 `@jeejio-bubble/bot`，不需要逐个安装依赖。

| 项目 | 你会看到什么 | 组成 | 设备 |
| --- | --- | --- | --- |
| [01-chat](./01-chat/) | 发一句话，杯子显示这句话 | Bot + TAL | P1 / S1 系列 |
| [02-pixel-text](./02-pixel-text/) | 设置文字、颜色和滚动效果，显示到杯子 | Bot + WebApp + TAL | P1 / S1 系列 |
| [03-ble-play](./03-ble-play/) | 手机滑动控制光点，轻点绽放火花 | Bot + WebApp + BLE + MPY | S1 Pro / Lite |

## 第一次运行

1. 安装冒泡 App，将 PixelMug 绑定到你的账号，并申请一个 Bot token。
2. 按 Studio 的安装说明启动 Studio，用同一个冒泡账号登录。
3. 在“选择应用”中打开一个具体项目目录，例如 `getting-started/01-chat`，不要打开本级目录。
4. Bot 入口为 `bot/index.js`，在 Studio 中填写 Bot token。API 环境应与申请 token 的环境一致。
5. 启动智能体，在“关联设备”卡片中选择你的 PixelMug。
6. 按项目 README 的步骤体验。

三个项目可以依次复用同一个 Bot；先停止当前智能体，再选择下一个项目。前两个项目没有 MPY，不需要加载设备代码。运行前确保设备在线；如果设备正运行其他 MPY 应用，先停止该程序，让固件显示接口接管屏幕。

WebApp 请在冒泡 App 内打开。电脑、手机与设备放在同一局域网，手机才能访问 Studio 提供的页面地址。第三个项目还需要开启手机蓝牙和相关权限，设备固件需提供 `maopaoBleApp` Simple 通道。

## 代码为什么这么少？

Studio 提供启动、网页服务和设备部署；SDK 提供消息、TAL 和 BLE。例子只写应用本身：不自建服务器、不添加调试协议、不模拟硬件、不维护兼容分支。

每个项目都是独立文件夹，可以直接阅读和修改。若将项目复制到 Studio 目录以外，需要自行安装 `@jeejio-bubble/bot@0.1.1`；网页中的 `/sdk/` 地址由 Studio 提供，因此仍应通过 Studio 打开项目。
