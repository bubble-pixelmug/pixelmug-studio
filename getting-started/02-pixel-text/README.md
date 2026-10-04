# 02 · 使用 WebApp 控制 PixelMug 文字

在冒泡 App 中打开文字控制器，输入文字，设置字体大小、颜色、滚动方向和速度，再直接显示到 PixelMug。支持 P1 和 S1 系列，不需要 MPY。

## 运行

1. 在 Studio 打开本目录，选择 `bot/index.js`，填写 token，并选择可供手机访问的 WebApp 地址。
2. 启动智能体，关联一个在线的 PixelMug。
3. 在冒泡 App 中私聊 Bot，发送 `/help` 查看介绍，使用 `/bindPixelMug` 关联设备，再发送 `/webApp`，点击“打开文字控制器”。
4. 调整显示内容和效果，点击“显示到 PixelMug”。

手机与电脑需在同一局域网。WebApp 先用 `getDevices()` 获取当前会话关联的设备，通过设备 SDK 的 `talPrintText()` 快捷接口生成 RPC，再用 `callDevice()` 直接发给设备。Bot 只声明设备、设置命令并提供 WebApp 入口，不处理 WebApp 请求。

## 改一个地方

WebApp 使用 `import { rpc } from '@jeejio-bubble/bot/devices/pixelmug/ext'` 获取指令生成方法，无需 `new PixelMug()`。`rpc.talPrintText()` 生成指令，`getDevices()` 获取关联设备，`callDevice(device, command)` 将指令发送给选中的设备。Bot 仍通过 `new PixelMug()` 和 `registerDevices()` 声明设备槽位。

WebApp 与 Bot 一样使用 npm 包名导入 SDK。Studio 在启动或重启智能体时自动构建页面，无需手动执行构建命令。字体和文字 RPC 在浏览器中执行；SDK 中依赖 Node.js 的图片转换接口应放在 Bot 中使用。

打开 `webapp/index.html`，修改文字输入框的默认 `value`，保存后重启智能体，再从 Bot 的新卡片打开页面。
