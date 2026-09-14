# PixelMug Studio

PixelMug Studio 是冒泡智能体应用的本地开发、运行和调试工具。一个应用必须包含 Bot，可以按需包含 WebApp 和 MPY 设备代码。

## 环境要求

- Node.js 20.6 或更高版本
- 当前源码目录位于 PixelMug 仓库的 `tools/studio/`
- 同级 PixelMug 仓库中包含 `mps/jeejio-bubble/`
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

## 开发命令

```sh
npm run dev       # 启动前端开发服务
npm run build     # 构建 Vue 前端到 ui-dist/
npm test          # 构建前端并运行完整测试
npm start         # 启动 Studio
```

## 目录说明

```text
assets/       Studio 图片资源
bindings.mjs  应用设备绑定状态
creator.mjs   CreatorHub 登录和设备查询
runtime/      Bot、WebApp 日志及 Studio 运行适配
launch.mjs    MPY 启动、重启、部署和停止流程
receiver.mjs  单轮日志与 WebApp 接收服务
gateway.mjs   固定 WebApp 局域网入口
workbench.mjs Studio 管理 API 和页面服务
ui/           Vue 前端源码
ui-dist/      可直接运行的前端构建产物
test/         自动化测试
examples/     示例应用
```

## 示例

- [`examples/minimal-mps`](examples/minimal-mps/README.md)：Bot、WebApp 和 MPY 的最小完整应用。
- [`examples/studio-debug`](examples/studio-debug/README.md)：Bot 与 WebApp 日志采集示例。

## 安全边界

冒泡账号凭据和 Bot token 只保留在 Studio 后台内存中，不写入应用目录。管理接口、WebApp 接口和单轮日志接口使用彼此独立的凭据。文件服务只开放明确的前端、WebApp 和 SDK 资源。
