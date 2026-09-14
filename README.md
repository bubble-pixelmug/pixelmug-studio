# PixelMug Studio：本地调试原型

设备 MPY 调试需要烧录包含 `talMpyRebootStartREPL`、`talMpyGetStudioState` 的新固件，并重启 Studio 后台加载新 SDK/启动流程。新固件显示静态 Python Dev → 静态 READY → 应用画面，不经过 Home；原手动 WebREPL 通路仍保留。详见 [专用模式](STUDIO-REPL-MODE.md)。

## Studio 前端

Studio 管理页面使用 Vue 3 组件实现，源码位于 `ui/`，生产构建输出到 `ui-dist/`。Node 管理服务继续提供原有 `/api/*` 接口，并从 `ui-dist/` 提供页面资源。

```powershell
npm run build
npm start
```

`npm test` 会先重新构建前端。`legacy-ui/` 保存迁移前的原生 HTML、JavaScript 和 CSS，便于对照或回退。
## 基础工作台（推荐）

项目根目录必须包含 `bot/`，并在 Studio 中指定其中的 `.js`、`.mjs` 或 `.cjs` 入口。`webapp/` 与 `mpy/` 是可选目录，由 Studio 自动识别；存在 `mpy/` 时必须同时包含 `mpy/__main__.py` 和合法 JSON 对象格式的 `mpy/mps.json`。支持 `bot`、`bot + WebApp`、`bot + MPY`、`bot + WebApp + MPY` 四种组合。


在仓库根目录执行：

```powershell
npm --prefix mps/jeejio-bubble ci
npm --prefix tools/studio ci
node tools/studio/server.mjs
```

Studio 自动通过 mDNS 将 `pixelmug-studio.local` 发布到当前所有可用的局域网 IPv4 网卡。打开终端输出的完整 Studio URL，无需选择或填写电脑 IP。

1. 使用冒泡手机号或邮箱获取验证码并登录。默认 CreatorHub 地址为 `https://connector.devjeejio.com:5443`，可在登录页修改或通过 `--creator-url` 指定。
2. 登录后自动查询绑定设备，页面约每 15 秒刷新，也可手动刷新。在线和离线设备均可查看，只有在线且绑定在当前用户下的设备可启动；无需选择设备或配置 `devices.local.json`。
3. 点击“打开目录”，在本机目录浏览器选择项目，支持手动输入路径及切换 Windows 磁盘。目录不会上传。选择 `tools/studio/examples/minimal-mps` 可测试最小示例。
4. 核对 bot 入口和 WebApp 目录，填写 bot token（已有 `BOT_TOKEN` 环境变量则可留空）。必要时填写 bot API 地址。项目依赖需预先安装，当前页面不执行 npm 安装或构建命令。
5. 点击“启动智能体”，后台启动 Bot 和可选 WebApp 服务。后台恢复已知 Bot 会话并查询服务端绑定；识别到在线绑定设备后，Studio 立即通过 Bot 让设备进入 Python Dev 等待态。首次没有会话记录时，在冒泡 App 向 Bot 发一条普通消息（minimal-mps 可用 `/devices`）；若尚未绑定，再用 `/bind` 完成绑定。默认情况下 Studio 此时不会上传 MPY，请继续在冒泡 App 中按应用流程操作 `/run` 或 WebApp；应用调用 `talMpyExecOneScript` 后，Studio 才上传并执行当前 MPY。若在运行设置中开启“启动后自动运行设备代码”，Studio 会在绑定设备进入 Python Dev 后自动上传并运行，每台设备每轮最多自动触发一次。
6. 页面展示设备部署阶段以及 Bot、WebApp、MPY 三端日志；日志可分栏显示或合并为统一时间线，也可按来源、级别、文本筛选，暂停滚动或清空视图。清空视图不删除文件。
7. “重启智能体”先通过旧 Bot 让本轮参与调试的设备重启进入 Python Dev，再创建新 Bot、WebApp 服务与 runId。默认模式下，新 Bot 重新确认绑定后保持等待；开发者需在冒泡 App 中再次操作应用。自动运行选项开启时，新 Bot 确认绑定后直接上传并执行当前 MPY。两种模式都复用已准备的 WebREPL 启动，不再次重启设备。冒泡卡片继续使用 `http://pixelmug-studio.local:7979` 下的固定项目入口，无需为本轮重新获取链接。

管理服务固定只监听 `127.0.0.1:8787`；WebApp Gateway 固定监听 `0.0.0.0:7979`，并通过 UDP 5353 发布 `pixelmug-studio.local`。单次运行接收端使用独立动态端口且只监听回环地址。系统防火墙需要允许 Studio 的局域网 TCP 7979 和 UDP 5353 通信。工作台管理凭据、运行接收端凭据和 WebApp 凭据彼此独立，普通 WebApp 凭据不能操作账号、项目目录或本地进程。

每次启动和显式设备重新运行，后台都重新请求 `/creator/devices`，根据真实 `deviceId` 校验用户绑定关系与 `online === "ONLINE"`。`slotId` 由 SDK 调用携带，不由设备列表或 Studio 另行配置。查询失败、会话过期、设备离线或未绑定均拒绝启动，不回退正式安装。

账号 token 仅在后台内存保存，使用 `token` 请求头访问设备和退出接口，不下发到页面、bot 或写入项目。验证码不记录；关闭后台需要重新登录。退出登录同时停止本地调试并请求云端 logout；即使云端退出失败，本地登录态也会清除。

“停止智能体”先取消本轮设备部署，通过仍在运行的 Bot 请求实际部署过的设备执行 `talRebootDevice`，等待应答或超时后关闭 Bot、应用服务及 WebREPL。每台设备会重新校验账号归属、在线状态及应用绑定；未确认重启的设备在页面提示。设备应答表示已接受重启请求，不等于已观测到重新上线。结果保存为本轮 `debug/<runId>/stop.json`。退出登录及直接关闭后台仍只关闭本地服务，不保证设备应用停止。已有日志保存在项目 `debug/<runId>/`。WebApp 要通过已有 Studio debug SDK 初始化上报日志，当前不会自动改写任意 WebApp；minimal-mps 已配置好。

基础 UI 已通过接口测试及真实 Chrome 交互测试；真实 CreatorHub 登录与真机部署仍需使用开发者账号和设备验收。旧命令行模式继续保留：带 `--project` 启动时仍使用下面的接收端方式及临时 `--devices` 配置。


当前支持 bot / WebApp 日志，以及 talMpyExecOneScript 的 Studio 专用分流、真机 WebREPL 部署和 MPY 日志。真机测试先阅读 [最小 MPS 示例](examples/minimal-mps/README.md)，协议与实现边界见 [LAUNCH-IMPLEMENTATION.md](LAUNCH-IMPLEMENTATION.md)。下面保留原有纯日志示例的使用步骤。

需要本机 Node.js **20.6 或更高版本**。首次运行需在仓库根目录执行 `npm --prefix tools/studio ci`，安装 WebREPL 使用的 ws 依赖。当前在源码工作区使用，与 `mps/jeejio-bubble/sdk` 同时检出；便携运行包及 SDK dist 构建不在此次改动内。

## 1. 无需 bot token，先体验日志

从项目根目录运行：

```sh
node tools/studio/server.mjs --project tools/studio/examples/studio-debug --bot bot/smoke-bot.js
```

终端输出两个**完整地址**：

- **Studio**：在 PC 浏览器打开，查看 bot / webapp 日志，可按来源和级别筛选。
- **WebApp**：打开示例页面，点击日志按钮。普通浏览器也能验证日志采集；真实 bot 请求只能在冒泡 App 内完成。

此模式的 `smoke-bot.js` 是普通 Node 日志程序，没有模拟冒泡 bot、JeeWeb 或硬件。按 Ctrl+C 停止本轮运行。

WebApp 固定使用 `http://pixelmug-studio.local:7979`，手机和电脑需要在同一局域网。单次运行接收端仅监听回环地址，局域网请求统一经过 Gateway。

## 2. 使用真实 bot 和冒泡 WebView

先在 `mps/jeejio-bubble` 中安装 bot SDK 依赖：

```sh
npm ci
```

回到项目根目录。Windows PowerShell：

```powershell
$env:BOT_TOKEN = "你的 bot token"
# 如果使用非默认冒泡 API，再设置：
# $env:BOT_API_BASE_URL = "你的 API 地址"
node tools/studio/server.mjs --project tools/studio/examples/studio-debug --bot bot/index.js
```

macOS / Linux：

```sh
BOT_TOKEN="你的 bot token" node tools/studio/server.mjs --project tools/studio/examples/studio-debug --bot bot/index.js
```

在冒泡 App 向这个 bot 发送 `/webapp`，点击返回的按钮。在 PC Studio 中观察：

1. WebApp 普通日志、warning、带堆栈的 error。
2. 未捕获异常、未处理 Promise rejection。
3. WebApp → bot → WebApp 请求成功的两端日志。
4. bot 主动抛出的处理错误及 WebApp 接收到的失败。

示例用 payload 中的 `requestId` 帮助人工关联请求。当前尚未自动注入业务 trace，也不改变 SDK 的业务请求或错误协议。接收程序每次启动生成新的 runId 和内部凭据；同一 Studio 进程中的项目卡片地址保持不变。

`BOT_SDK_DEBUG=1` 可增加 SDK 自身的请求日志；这与 Studio 日志采集的开关无关。

## 3. 项目中留下什么

```text
debug/
  run-<时间>-<随机标识>/
    run.json          # 当前项目、入口、runId、可选 buildId
    events.jsonl      # bot/WebApp 结构化记录，一行一个 JSON
    events.log        # 易读的合并日志
    bot.stdout.log    # 原始 stdout 的文本副本（带基础脱敏）
    bot.stderr.log    # 原始 stderr 的文本副本，包括崩溃堆栈
    bot-exit.json     # bot 退出码、信号和时间
    receiver.log      # 接收端异常诊断，按需生成
```

编辑器和 Agent 直接读取这些文件。stdout/stderr 不再重复加入 `events.jsonl`；它们用于补充未通过 console 的库输出、Node 警告以及进程退出前未完成上报的日志。没有输出的文件可能不生成。

UI 只保留最近 1000 条记录；磁盘文件保存整轮记录，不自动清理历史运行。重试去重覆盖最近 10000 条已接收记录。SDK 默认每 250ms 批量发送、最多排队 500 条，队列满后丢弃新日志，恢复时报告丢弃数。WebView 关闭、进程强杀或断电时，尚未送达的记录可能丢失；本版不提供可靠消息队列。

## 4. 如何接入已有项目

```sh
node tools/studio/server.mjs --project /path/to/project --bot bot/index.js
```

- `webapp/` 是固定的可选公开目录；不要放置 bot token、配置私密文件或服务端代码。接收端不会托管整个项目。
- `--bot` 必须指定 `bot/` 内的 Node 入口；Studio 注入 Node preload 和会话配置，在业务模块加载前启用采集。
- bot 通过 `process.env.STUDIO_WEBAPP_URL` 获取本轮 WebApp 完整启动地址，供冒泡中的打开按钮使用。
- WebApp 在加载业务模块前接入两行初始化，见 [Studio 接入说明](STUDIO-DEBUG.md)。
- 此原型按 `webapp/` 中的静态文件提供服务，不运行 Vite、不替开发者构建 TS/React。构建工程需将公开构建产物输出到 `webapp/`，并保留调试引导。
- `--build-id` 可选，仅记录调用者提供的版本标识；当前不自动创建 Git 仓库或提交。

## 5. 当前传输与边界

bot 默认使用父子进程 IPC，不需要连接局域网 HTTP；WebApp 同源 POST 到 `/api/logs`。配置未开启时，SDK 不修改 console、不发起日志请求。采集保留原 console，vConsole 可以继续使用。

浏览器以正常事件监听采集 `error` / `unhandledrejection`，不取消默认行为。Node 使用 `uncaughtExceptionMonitor`，不接管崩溃退出策略。正常退出尝试发送待传记录；突然退出依靠 stderr 文件补充。

运行生成的凭据通过 URL fragment 传入页面，并暂存在 sessionStorage；不会写进项目源码或请求 URL。WebApp 凭据允许上报 webapp 日志，并调用当前项目 --devices 白名单内的启动控制接口；PC Studio 使用另一凭据读取汇总日志及显式重新运行。刷新可沿用凭据，重启接收程序后旧凭据失效。不开放通用命令执行或凭据查询接口；设备控制限于 MPS 专用启动流程。

服务检查 Host、Origin、会话、来源、记录大小和批量大小，不开放通配 CORS。当前局域网传输使用 HTTP，设计用于开发网络。Studio 运行层/接收端对常见 token、密码、Authorization 和显式配置的 secrets 做基础脱敏；无法识别所有业务秘密，不要主动打印凭据。Studio 托管的是开发者 WebApp；`/sdk/` 当前仅开放所需的浏览器模块白名单，用于内部源码联调，正式 SDK 分发仍按 DESIGN 中的 dist 方案。

## 验证

```sh
# 项目根目录
node --test tools/studio/test/*.test.mjs
# mps/jeejio-bubble 目录
npm run test:sdk
```

自动化覆盖 console 保留/恢复、重复初始化、序列化、基础脱敏、队列重试、鉴权、去重、路径隔离、HTTP 真实收发及 Node 正常/异常退出。冒泡 App 的实际 WebView 和真实 bot API 需按第 2 节手工验收。

可选真实 Chromium 页面测试：设置 `STUDIO_TEST_BROWSER` 为本机 Chrome/Chromium 可执行文件路径，再运行上述接收端测试。测试使用临时目录和独立无界面浏览器配置，验证真实页面中的 console、全局异常及 Promise rejection。未设置时该项跳过。

版本管理提示：当前 PixelMug 根仓库的 `.gitignore` 忽略整个 `tools/`，本原型沿用该规则；保存或分发 Studio 时需在你选定的仓库中显式纳入这些文件。

## 应用绑定自动发现

Studio 的 bot 适配器监听现有 `message:bind_device`，不新增应用侧绑定接口，也不拦截开发者的事件监听。收到普通消息/WebApp 请求时查询已有绑定；绑定事件强制刷新。已知会话每 15 秒重新查询，用于恢复临时查询失败、服务端缓存延迟及更新换绑/解绑。成功返回空数组会移除该会话的运行入口；查询失败保留上次结果，运行前仍通过 bot 重新核验绑定。

项目 `debug/studio-binding-scopes.json` 仅保存会话查询线索，按 bot 凭据和 API 地址的 SHA-256 标识隔离，不保存 token、设备绑定或可直接执行的上下文。重启后的可运行设备必须经过服务端重新确认。首次没有历史会话时，需要一条普通会话消息提供 contactId，不要求重复绑定。

工作台“应用设备”显示实际应用绑定的设备/槽位/会话。“运行 MPY”首次部署，“重新运行设备”重新读取源码并部署。账号绑定设备列表仍用于授权和在线检查，不代替应用绑定。运行前需要项目包含 `mpy/__main__.py`，bot 执行器在线。

设备卡片和运行状态显示最近获取的 Wi-Fi 名称、设备 IP 和查询时间；开始运行设备时，经本地 Bot 的 PixelMugS1 设备 SDK 调用 talGetWifiInfo 获取名称，IP 以 talMpyGetStudioState 为准。查询名称失败不阻止部署。尚未运行的设备显示待获取；这些信息不是实时网络监控。页面同时显示固定 WebApp 域名和端口。

## SDK 边界

Studio 专用日志、绑定同步、启动分流及辅助 RPC 已迁移到本目录的 `runtime/` 和 `devices/`；通用 SDK 无 Studio 依赖。Bot 仍自动预加载，WebApp 调试入口改为 `/studio-runtime/StudioDebugWeb.js`。当前适配层和应用需使用同一个 SDK 模块，详见 [边界设计](SDK-BOUNDARY.md) 和 [接入说明](STUDIO-DEBUG.md)。

## 智能体重启的设备交接

设备专用重启由旧 Bot 执行，使用 `talMpyRebootStartREPL`。新 Bot 恢复绑定后不会主动上传；它等待 Bot 或 WebApp 因用户操作调用 `talMpyExecOneScript`，再通过 `talMpyGetStudioState` 核验同一个 requestId、连接 WebREPL、上传并执行。成功交接只重启设备一次，不经过 Home。重启回包丢失时不重复发送，由后续启动调用核验真实状态。

新进程必须重新查询绑定，不把旧进程的执行权限直接复用。不同设备各自恢复并保持 Python Dev 等待态。准备结果保存在旧轮 `restart-prepare.json`，新轮状态保存在 `restart.json`。在冒泡应用发起启动前，Studio 不会创建 MPY 部署任务，也不会报告应用已运行；新 Bot 无法启动、绑定改变或设备无法连接时，会显示对应失败原因。
