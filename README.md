# PixelMug Studio

PixelMug Studio 是冒泡智能体应用的本地开发、运行和调试工具。一个应用必须包含 Bot，可以按需包含 WebApp 和 MPY 设备代码。

## 环境要求

- Node.js 20.6 或更高版本
- Bubble SDK 通过 npm 依赖 @jeejio-bubble/bot 安装，无需本地 SDK 源码目录
- 设备端 MPY 调试需要支持 `talMpyRebootStartREPL` 和 `talMpyGetStudioState` 的固件

## 安装与启动

在 `tools/studio` 目录执行：

```sh
npm ci
npm start
```

打开终端输出的完整 Studio 地址。Studio 管理服务只监听本机；WebApp Gateway 使用 `pixelmug-studio.local:7979`，手机、电脑和 PixelMug 应位于同一局域网。

## 智能体应用结构

```text
my-agent/
├─ bot/                  # 必需
│  └─ index.js           # 在 Studio 中指定入口
├─ webapp/               # 可选
└─ mpy/                  # 可选
   ├─ __main__.py        # 必需的 MPY 入口
   └─ mps.json           # 必需的 MPY 配置
```

支持以下组合：

- Bot
- Bot + WebApp
- Bot + MPY
- Bot + WebApp + MPY

## 使用流程

1. 使用冒泡账号登录 Studio。
2. 在“选择应用”中打开本地应用目录，确认 Bot 入口和 Bot token。
3. 用户在冒泡 App 中完成设备绑定；Studio 会读取当前 Bot 的绑定设备。
4. 点击“启动智能体”。Studio 启动 Bot，并在存在 WebApp 时提供固定的局域网访问入口。
5. 应用包含 MPY 时，可以由冒泡智能体触发设备代码加载，也可以开启“启动后自动运行设备代码”。
6. 在“调试运行”查看 Bot、WebApp 日志；在设备子页面查看部署过程和 MPY 日志。
7. “重启智能体”重新加载本轮服务和设备代码；“停止智能体”停止本地服务，并请求本轮已部署设备普通重启。

运行日志保存在应用的 `debug/<runId>/` 下。该目录不会由 Studio 自动删除，建议在应用仓库中忽略 `debug/`。


## WebApp 自动构建

应用的 `webapp/index.html` 作为页面入口，使用 `<script type="module" src="./main.js"></script>` 引入业务代码。WebApp 可以和 Bot 一样按 npm 包名引用浏览器兼容的 SDK：

```js
import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import PixelMug from '@jeejio-bubble/bot/devices/pixelmug/ext';
```

启动、重启智能体时，Studio 自动构建 HTML、JS 和 CSS，将产物保存在 `debug/<runId>/webapp/` 并通过局域网入口提供访问。源码不被覆盖；修改后保存并重启即可。构建失败会显示错误并阻止本次启动。SDK 使用 Studio 已安装的版本，不会在启动时自动下载或更新。其他浏览器依赖优先从项目解析，也可使用 Studio 已安装的包。

当前使用 Studio 内置构建配置，支持 HTML、JavaScript、TypeScript、CSS 和静态资源；不会执行应用自己的 Vite 配置。需要原样保留的静态文件放入 `webapp/public/`。SDK 的 `talPrintText()` 可在浏览器使用；依赖 Node.js 的图片转换接口仍需在 Bot 执行。

## 文件浏览与编辑

选择应用后，左侧“选择应用”下方会显示项目目录树。点击文件可编辑，支持常见代码语法高亮、撤销/重做，以及 Ctrl+S / ⌘S 保存。展开目录时自动加载文件列表。

仅编辑当前项目中不超过 1 MB 的 UTF-8 文本文件；目录树跳过 `.git`、`node_modules`、`debug` 及符号链接。保存会检查外部修改；切换文件、项目或关闭页面时会提醒未保存内容。运行中的代码修改保存后，需要重启智能体加载。

## 开发文档

文档站源码位于仓库根目录 `docs/`，与 Studio 独立安装和运行：

```sh
cd ../../docs
npm ci
npm run dev
```

本地文档地址为 http://127.0.0.1:5174/ 。Studio 的“开发文档”导航通过 iframe 展示该站点，也支持独立打开。首次接入需重启 Studio。

部署远程文档后，可设置 `STUDIO_DOCS_URL` 或使用 `npm start -- --docs-url https://你的文档域名/`。Studio 只允许 iframe 加载配置的文档来源。文档站部署及维护说明见根目录 `docs/README.md`。

完整可运行示例仍放在 `tools/studio/examples/`，文档站只保存说明文档和用法代码片段。

## 开发命令

```sh
npm run dev       # 启动前端开发服务
npm run build     # 构建 Vue 前端到 ui-dist/
npm test          # 构建前端并运行完整测试
npm start         # 启动 Studio
```

## 目录说明

```text
src/               Studio Node 后端源码
src/runtime/       Bot、WebApp 日志及运行适配
src/devices/       PixelMug 设备 SDK 适配
src/launch.mjs     MPY 启动、重启、部署和停止流程
src/receiver.mjs   单轮日志与 WebApp 接收服务
src/gateway.mjs    固定 WebApp 局域网入口
src/workbench.mjs  Studio 管理 API 和页面服务
ui/                Vue 前端源码
ui/assets/         前端图片资源
ui-dist/           可直接运行的前端构建产物
test/              自动化测试
examples/          示例应用
```

## 示例

- [`examples/minimal-mps`](examples/minimal-mps/README.md)：Bot、WebApp 和 MPY 的最小完整应用。
- [`examples/studio-debug`](examples/studio-debug/README.md)：Bot 与 WebApp 日志采集示例。

## 安全边界

冒泡账号凭据和 Bot token 只保留在 Studio 后台内存中，不写入应用目录。管理接口、WebApp 接口和单轮日志接口使用彼此独立的凭据。文件服务只开放明确的前端、WebApp 和 SDK 资源。
