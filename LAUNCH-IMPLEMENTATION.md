# MPS 启动实现说明

> 当前模块归属以 [SDK 与 Studio 边界](SDK-BOUNDARY.md) 为准：所有 Studio 专用接入均由 `tools/studio/runtime` 和 `devices` 承担。下述设备运行协议保持不变。

对应 [专项设计](MPS-LAUNCH-DESIGN.md)。最小运行示例见 [minimal-mps](examples/minimal-mps/README.md)。

## 已实现

- Studio `runtime/StudioLaunch.js` 提供公共专用分流；Node 端 `StudioLaunchNode.js` 通过 IPC 请求，WebApp 通过同源 HTTP 请求。
- 已有 `enableStudioDebug` 初始化同时安装日志和启动适配器，不增加开发者开关。
- 仅拦截 `talMpyExecOneScript`。MPS ID/版本不参与启动。其余 RPC 保持原链路。
- bot 同步调用通过原 response context 返回；异步仍返回 ACK=201 的任务，再走原完成事件。
- Studio `launch.mjs` 维护每台设备的启动任务、授权、源码指纹、去重、阶段和日志。
- `deploy.mjs` 固定本轮文件内容、拒绝保留文件冲突、清理旧代码、逐文件上传及大小校验。
- `webrepl.mjs` 用 ws 自动认证，执行 raw REPL 命令、PUT 文件并接收输出；固定密码 pixelmug。
- `device-bootstrap.py` 每轮上传，使用真实文件名编译/执行 `/__main__.py`，报告开始、完成、失败或中断。
- Studio PC 页面展示 MPY 日志、任务状态及重新运行按钮。
- 已新增固件 Studio 专用 REPL 启动模式；原手动 REPL 通路保留。见 [专用模式实现](STUDIO-REPL-MODE.md)。

## 登录与设备校验

基础工作台已接入 CreatorHub 验证码登录、退出及 `/creator/devices` 查询。默认服务地址 `https://connector.devjeejio.com:5443`。页面自动展示绑定设备及在线状态，不提供设备选择。每次实际启动或重新运行，通过 `LaunchManager.authorizeDevice` 钩子重新查询并检查调用目标是否绑定在登录用户下、是否 `ONLINE`；失败即拒绝。

bot 和冒泡 App 继续管理应用设备定义与动态绑定。`deviceId` 来自 SDK 实际目标，`slotId` 保留为调用上下文，不要求用户配置，也不拿它匹配账号设备列表。

旧命令行模式（带 `--project`）仍保留 `--devices` / `devices.local.json` 临时静态检查，不验证真实用户身份。工作台模式不使用该手工配置。接口契约和浏览器流程已测试，尚待真实账号及硬件验收。

## 控制协议

统一消息携带 `runId`、`clientId`、`op`：

| op | 用途 |
| --- | --- |
| register | 仅 bot 注册绑定设备的辅助 RPC 执行上下文，返回 contextId |
| launch | 提交目标 deviceId/slotId、contextId 和 ownerId，返回原 RPC 结构及内部 launchId |
| poll | 携带事件游标 after，获取后续状态以及尚未应答的辅助 RPC 命令 |
| reply | 回传某个 commandId 的结果或错误 |
| rerun | 仅 PC Studio 凭据可用，指定 launchId 创建新运行 |

WebApp 使用 `POST /api/launch`；Node 使用 `pixelmug:control` / `pixelmug:control:response` IPC 消息。控制请求不经过日志队列。WebApp 控制凭据只能操作本轮 --devices 中的设备；不能读取完整合并日志，也不能使用 PC rerun 操作。

当前用约 400ms 轮询交付事件和辅助命令，两端共用逻辑。未应答命令持续返回，SDK 缓存其执行结果，避免因网络重试重复重启设备。状态带序号，断线恢复后按游标继续；超出保留窗口则返回当前已知状态。

辅助 RPC 统一在本地 bot SDK 执行，固定为 talMpyRebootStartREPL、talMpyGetStudioState。前者携带 requestId（本次 launchId），后者返回实际启动状态。WebApp 首次通过既有 bot 请求通道发送 `system.studio.prepareMps`，bot 查询真实绑定并注册执行上下文，返回不包含凭据的 `contextId`；WebApp 再向 Studio 提交启动请求。Studio 仅接受 bot 注册的上下文，目标设备必须匹配。bot 自己发起启动时自动完成相同注册。每个辅助 RPC 发出前 bot 再校验设备 ID、slotId 与槽位仍匹配，防止换绑后控制另一台设备。

请求方订阅与执行器分离：WebApp 仅收取状态事件，不接收辅助 RPC 命令；任务始终保留 bot 执行器，所以手机息屏或页面关闭不会阻断已受理任务及 PC 重跑。bot 进程或 IPC 不可用则失败，不回退 WebApp 或正式安装。Studio 不通过注册接口获取 bot token。

启动后 WebApp 通过已有 system.deviceEvent 获得 mpyVmEvent，额外的 studio.launch 事件提供调试阶段。bot 使用原 device_notify 入口。回传就绪只表示设备引导已开始执行入口，异常仍会继续报告。

## 部署与状态边界

每轮保留 /boot.py、/webrepl_cfg.py，不格式化。上传入口必须为 mpy/__main__.py。项目根 boot.py、webrepl_cfg.py、__studio_bootstrap__.py 为保留名称，冲突时在设备重启前拒绝。不支持符号链接，文件名按 FAT 和 WebREPL 63 字节限制校验。当前大小校验不等同于设备端内容哈希校验。

源码在部署前读入内存并保存到本轮 source/，最多 32 MB、2000 个文件。应用运行后不能在同一 REPL 上继续上传，重新运行必须重启。

默认重启后至少等待 3 秒，再用 talMpyGetStudioState 确认本次 requestId、网络和 WebREPL 就绪，最多等待约 90 秒；WebREPL 连接阶段约 60 秒，原始命令默认 15 秒，入口确认约 20 秒。单个在途 RPC/连接超时可能使阶段总时长略超出该窗口。这些是初始默认值，需真机测量后调整。现有应用自身的 45 秒 Loading 超时不会被 SDK 静默修改；示例以 Studio 阶段事件显示进度。

专用启动直接进入 MpyReplMode；不再下发 talMpyStartREPL。连接重试会重新核对本次启动状态及 IP。不能依靠普通日志中的 running 字样判断成功；引导控制消息包含 launchId 和本轮随机标记。

任务已运行且源码未变时返回 264；新建任务返回 262 并异步继续。不同构建在同一设备部署期间明确拒绝，部署完成后可再启动。PC 显式重新运行始终新建任务；它需要本地 bot 执行器在线。

## 尚未承诺

- 尚未完成真实冒泡 App + PixelMug 的硬件验收。
- 专用请求只作用于下一次启动；普通重启不会永久留在开发模式。
- 不保证所有底层原生日志都进入 WebREPL，也不保证掉电前日志完整。
- 不把文件部署写入固件正式 MPS 安装状态；正式发布流程不变。
- 不提供通用设备 RPC 代理、模拟器、任意远程脚本执行 API 或云端托管。
- 未完成 SDK dist 分发和 Studio 便携安装包。

测试命令：

```powershell
npm --prefix mps/jeejio-bubble run test:sdk
npm --prefix tools/studio test
```

真实 Chromium 页面测试可额外设置 STUDIO_TEST_BROWSER 为 Chrome/Chromium 可执行文件路径。


## 重新运行时的调用方可用性

设备任务保存 bot 注册的执行器，独立于 WebApp 页面生命周期。PC 重跑前检查该 bot 最近 10 秒是否轮询；不满足时拒绝新任务并提示检查本地 bot。首次启动的上下文准备需要 WebApp 能与 bot 通信；一旦 Studio 受理任务，后续 RPC 和重跑不依赖页面前台运行。

日志区分 `RPC queued`、`RPC delivered to ... SDK` 和执行器回传。已交付仅证明控制请求被 SDK 轮询领取，不证明设备已重启。未领取的请求报调用方不可用，直接失败，不进入“重启回包丢失”的恢复探测。重启回包丢失的恢复路径只用于已经交付给 SDK 的调用。

## 已运行状态的有效性

同源码再次调用时，只有原 WebREPL 连接通过本次 GET_VER 检查、且任务仍为 running，才返回 264 / MPS_IS_RUNNING。运行期间每 10 秒检查一次，单次等待最多 3 秒。周期探测超时只记录连接警告，保留最后已知的 running 状态和原连接，继续接收日志；探测恢复后清除警告。主动启动时若仍无法确认旧连接，则将旧任务标记 unknown，再新建部署任务，返回 262，使用本次启动上下文注册的 bot 作为执行器。

GET_VER 是现有固件的 WebREPL 二进制协议操作，返回三个版本字节，不执行 Python、不访问文件、不发 Ctrl+C。超时后保留该次响应槽，收到迟到响应之前不发送新探测；版本响应不会混入应用日志，应用输出仍正常采集。固件 WebSocket 当前忽略 Ping/Pong，因此不使用它判断连接存活。

探测确认的是原连接可响应，并结合任务生命周期判断是否仍可复用；不能证明业务功能健康。设备忙于阻塞操作时也可能超时，此时只显示连接警告。实际断连后的 unknown 不映射为 RUNNING_FAIL；只有明确的应用失败才上报 RUNNING_FAIL。实际固件处理 GET_VER 的运行时延尚需真机验收，不自动重启设备；重新部署由后续启动调用触发。


## 无需安装 RPC 的首次设备运行

Studio 调试环境启动后，Studio 的 bot 适配器恢复项目内已保存的会话查询线索，调用现有 `getBoundDevices` 从 `/bot/detail` 查询实际绑定；有结果则注册设备执行上下文，无结果等待用户绑定。首次没有会话线索时，普通会话消息即可触发查询。`sendBindDevice` 保持发送卡片的行为，完成绑定后的 `message:bind_device` 触发重新查询，开发者的原事件监听继续执行。

绑定设备与部署任务分开维护。PC 页面可以对尚未创建 launch 的绑定设备执行“运行 MPY”；服务端 `runBinding` 根据 bot 注册的上下文进入原部署流程，每次运行重新校验账号授权及 bot 绑定。应用主动调用 `talMpyExecOneScript` 仍兼容原去重逻辑。

新增内部控制操作：仅 bot 可以调用 `bindingScopes` 读取本 bot 的会话线索、`syncBindings` 同步某会话的完整绑定快照。成功空快照移除绑定及执行上下文，失败查询不发送空快照。已知会话每 15 秒刷新；同一作用域的查询串行，避免旧响应覆盖新绑定。

新增代码：Studio `runtime/StudioBindings.js` 管理发现和恢复，`StudioLaunch.js` 维护稳定的绑定订阅；Studio `bindings.mjs` 管理绑定列表与 `debug/studio-binding-scopes.json`。磁盘仅存会话线索及 bot 身份摘要，不保存 token 或可直接复用的设备绑定。启动恢复必须重新查询服务端。两端其它业务接口和固件无需因此改变。
