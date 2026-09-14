# MPS 调试启动专用通道与 WebREPL 部署设计

> 当前模块归属以 [SDK 与 Studio 边界](SDK-BOUNDARY.md) 为准：所有 Studio 专用接入均由 `tools/studio/runtime` 和 `devices` 承担。下述设备运行协议保持不变。

状态：方案已确认，首版代码已按本设计实现；具体完成范围及真机验收边界见 [LAUNCH-IMPLEMENTATION.md](LAUNCH-IMPLEMENTATION.md)。  
日期：2026-09-10  
位置：`tools/studio`  
关联：[整体设计](DESIGN.md)、[当前日志原型](README.md)。

## 1. 目标与范围

开发者继续使用现有 bot / WebApp SDK 调用 `talMpyExecOneScript`。正式模式走原有冒泡服务器及设备安装流程；Studio 调试模式走专用的本地部署通道：重启真实 PixelMug，进入 WebREPL，清理旧应用，上传本地代码，执行入口并回传状态及日志。

专用入口统一命名为 **`studioLaunchMps`**。讨论中出现的 `studioLanchMps` 指同一个入口，后续实现统一使用 Launch 拼写。

本轮仅覆盖该 RPC 的分流和真机调试启动：

- 不模拟设备、固件或应用执行。
- 不建设通用的“所有设备 RPC 经 Studio 转发”机制。
- 不通过正式 MPS 发布服务上传、下载或安装云端包。
- 不要求开发者在业务代码中区分正式与调试模式。
- 不修改其他设备 RPC 的既有调用路径。
- 不要求设备每次开机自动进入 REPL，由 Studio 每轮主动完成启动流程。

这里的“安装”是清理并部署本地源码及资源，不是生成和安装正式 `.mps` 包。

## 2. SDK 分流规则

只在设备调用入口匹配以下条件：

```js
if (studioDebugEnabled && rpc.method === "talMpyExecOneScript") {
  return studioLaunchMps(device, rpc, options);
}
return originalCallDevice(device, rpc, options);
```

以上为流程示意，实际适配保留各入口的调用签名和返回结构；Studio 模式对 MPS ID 与版本参数的处理按下述例外执行。

| 调用入口 | 正式模式 | Studio 调试模式 |
| --- | --- | --- |
| WebApp `callDevice` 调用该方法 | 原有 JeeWeb / 冒泡链路 | 专用 HTTP 控制请求到 Studio |
| bot `callDevice` 调用该方法 | 原有 bot SDK / 冒泡链路 | 专用 IPC 控制请求到 Studio |
| bot `callDeviceAsync` 调用该方法 | 原有异步设备调用链路 | 同一专用通道，保留异步任务契约 |
| 任意其他设备 RPC | 原有链路 | 原有链路，不通过 WebREPL 执行 |

具体分流点在 WebApp 发往 `JeeWeb.sendTAL` 之前，以及 bot 同步、异步调用发往冒泡 API 之前。两种 bot 调用应共享专用分流判断，不能漏掉异步路径。

不全局替换 `fetch`，不整体代理 JeeWeb，不要求业务改成调用新的公开安装 API。`studioLaunchMps` 是 Studio 内部实现入口。

### 2.1 一个 Studio 开发模式

对开发者只暴露统一的 Studio 调试模式，不设置独立的“日志开关”和“设备启动分流开关”：

- Studio 模式启用日志采集，并为该 RPC 安装本地启动适配器。
- bot 通过 Studio 的 Node preload 初始化。
- WebApp 通过已有的页面调试初始化接入；当前仍需在模板/入口接入一次，静态托管本身不会自动改写应用。
- 普通 SDK `debug` 选项仍只控制 SDK 日志详细程度。
- 未进入 Studio 模式时，不依赖 Studio 在线。

日志模块与设备控制模块内部独立实现。设备启动失败不影响日志采集。

当前 Studio 运行适配层已接入该专用分流；控制协议及限制见实现说明。

### 2.2 不允许静默回退

Studio 模式下匹配到该 RPC 后，以下情况应明确失败，不回退到正式安装：

- Studio 不在线或会话失效。
- 当前调试会话未关联本地项目，或项目工作区不可用。
- 目标设备未配置、无调用权限或槽位映射不明确。
- 设备重启、连接、认证、清理、上传或执行失败。

其他 RPC 始终保持原路径，不受此分流影响。

## 3. 项目、设备与启动任务

Studio 本地持有：

- 项目根目录及 `mpy/` 源码目录。
- 项目中可选的 MPS ID、版本元数据（仅供展示或正式发布使用，不作为调试启动条件）。
- 允许开发的设备身份及相应槽位/会话映射。
- 当前 Studio `runId`。
- 本次源码清单/指纹及可选代码版本标识。
- 每台设备的连接与启动任务状态。

调用请求保留目标设备上下文，不允许通过远端请求指定任意本地目录、任意脚本或任意设备地址。IP 由目标设备的 Wi-Fi RPC 响应取得，不能替代设备身份。

**Studio debug run 模式忽略 `talMpyExecOneScript` 的 `params.id` 和 `params.version`。** 始终部署当前调试会话关联的本地项目 `mpy/`：

- 不用这两个参数选择项目、寻找云端 MPS 包或检查版本是否一致。
- 参数缺失、为空或与项目元数据不同，不因此拒绝调试启动；分流应发生在正式安装专用的 ID/版本校验之前。
- 原始参数可以保留在请求诊断信息中，但不参与部署、去重或“已经运行”的判断。
- 项目由 Studio 会话确定；目标设备、槽位、权限及会话有效性仍需校验。
- 去重和已运行判断依据本地项目、目标设备及实际源码指纹，不依赖 MPS ID 或版本号。
- 正式模式保留原有参数处理和设备调用流程，此例外仅适用于 Studio 专用启动通道。

### 3.1 runId 与 launchId

- `runId`：保留现有含义，每次启动 Studio 接收程序生成一次。
- `launchId`：每次真正创建新的设备调试启动任务生成，关联部署、状态与 MPY 日志。
- `requestId` / 原 `traceId`：关联某个 SDK 调用及其响应。
- `deviceId` / 槽位：区分设备；`clientId` 区分调用客户端。

同一 Studio 会话可以有多个 launchId，也可以同时开发多台设备。不得仅以 runId 或 MPS 版本判断设备正在运行哪一份本地代码。

### 3.2 重复请求与显式重新运行

每台设备同一时刻只允许一个部署任务：

- 同一设备、同一份源码的重复启动请求复用已有任务，分别回传到各调用方。
- 已确认同一份源码运行时，可以按原契约返回 `264`，不再次重启。
- Studio 显式“重新运行”创建新任务，即使源码未变也先整机重启。
- 源码发生变化时需要新任务；已有任务冲突时必须明确排队或拒绝，不能同时清理/上传。
- 不同设备独立执行，不能复用某台设备的 IP、进度或就绪状态。

“每轮先重启”指新创建的启动任务，不是每收到一个重复 RPC 都重启。

上传前确定本轮文件集合；不能在部署过程中混入编辑器刚修改的另一版文件。采用快照或读取后校验的具体方式在实现时确定。

## 4. 专用控制通道与辅助设备 RPC

```text
WebApp SDK ── HTTP 请求 + 事件回传 ──┐
                                    ├─ Studio 启动任务协调器
bot SDK ───── IPC 请求/响应/事件 ────┘
                                               │
                         普通冒泡设备 RPC + 设备 WebREPL
```

bot 可以复用现有父子进程 IPC，但增加独立的请求、响应和事件消息类型，不能当作日志消息发送。

WebApp 使用专用的鉴权控制接口，后续事件通过可恢复的订阅通道返回。具体 URL、消息字段和选用 WebSocket/SSE/轮询在实现时细化；这不影响“WebApp 发 HTTP 启动请求，业务继续使用原 SDK”的约定。

控制通道必须有请求关联、超时、断线处理及任务状态恢复。不能复用允许丢弃的日志队列承载启动结果。

### 4.1 辅助 RPC 仍走冒泡

设备实际接口名：

- `talMpyRebootStartREPL(requestId)`
- `talMpyGetStudioState()`

Studio 协调调用这些接口，但执行路径仍是原 SDK → 冒泡服务器 → 设备，不是 WebREPL。这两个是新增专用 RPC；原有手动 `talMpyStartREPL` 接口和流程保留。

辅助 RPC 全部由本地 bot SDK 执行，无论 `talMpyExecOneScript` 来自 bot 还是 WebApp。WebApp 发起时，先通过现有 bot 请求通道 `system.studio.prepareMps` 准备上下文：bot 查询当前会话绑定、核对 deviceId/slotId，并向 Studio 注册执行器，返回 contextId。Studio 接受启动请求时匹配该 contextId 与目标设备，将事件订阅者和 bot 执行器分离。

bot 保存真实 chat、接收者及设备槽位上下文，每次辅助 RPC 前重新校验绑定，不能只按客户端提供的槽位重启设备。WebApp 不再执行辅助 RPC；首次请求受理后手机息屏、页面关闭不影响部署和 PC 重跑。本地 bot 不可用时明确失败，不回退到 WebApp。其他业务 RPC 保持原链路。

### 4.2 授权边界

WebApp 调试凭据支持日志上报和受限的设备调试启动。控制权限限定当前项目及会话，不开放任意命令执行或文件路径操作。

目标设备规则（已确认）：

- Studio 使用冒泡用户 ID 和验证码登录后，自动获取并维护该用户绑定的所有在线设备列表，不要求用户选择开发设备或逐台授权。
- bot 定义设备角色、数量与槽位，用户在冒泡 App 中动态绑定设备；SDK 运行时取得实际设备对象，并在分流 `talMpyExecOneScript` 时携带目标设备标识和调用上下文。
- Studio 仅按目标设备校验其与当前登录用户的绑定关系及在线状态。两项均通过才启动 WebREPL 流程；失败时返回明确错误，不重启、清理、上传或回退到正式安装。
- 多设备应用逐次校验各调用目标，各设备独立执行；Studio 不另建 MPS 绑定关系，不要求配置业务槽位映射，不把一次请求广播给整个在线列表。
- 新启动和显式重新运行均需校验当前绑定及在线状态。列表刷新与缓存策略待细化；本轮主动重启造成的暂时离线由后续等待恢复阶段处理。

当前实现边界：基础工作台已实现冒泡验证码登录、设备查询及启动前动态校验，不要求设备选择或手工列表。带 `--project` 的旧命令行模式仍通过 `--devices` / `devices.local.json` 检查 `deviceId + slotId`，仅供兼容调试，不证明真实用户绑定或在线状态。工作台的真实账号与硬件验收仍待完成。

WebREPL 密码只在 Studio 后台使用，不下发给 WebApp。内部控制消息中的凭据不进入日志。

## 5. 每轮真机调试流程

新建启动任务后，固定执行：

```text
校验请求、项目与源码，以及目标与登录用户的绑定关系和在线状态，锁定调用指定的设备
→ talMpyRebootStartREPL(requestId = launchId)
→ 重启进入 MpyReplMode，不创建 Home、不播放动画
→ talMpyGetStudioState 确认本次 requestId、网络和 WebREPL 就绪，获取 IP
→ 等待 WebREPL 服务可连接
→ WebSocket 连接并完成密码认证
→ 确认 REPL 可执行命令
→ 清空旧应用工作区，保留两个根目录启动文件
→ 上传 mpy/ 中除 dist/ 以外的项目文件
→ 上传 Studio 统一引导程序
→ 校验文件传输结果
→ 执行统一引导程序
→ 引导程序执行 __main__.py
→ 持续接收运行状态、异常与日志
```

### 5.1 重启与上线确认

`talMpyRebootStartREPL` 持久化独立的一次性启动 requestId，安排约 300ms 后重启。返回 true 只表示已接受。记录在启动时消费；不修改持久化 runningMode，也不改变旧 `MPY_BOOT_INTENT_REPL` 语义。OTA、保护模式优先；普通重启退出 Studio 模式。

Studio 仅发送一次重启 RPC。回包因重启丢失时继续查询，不盲目重发。收到的状态必须携带当前 launchId 对应的 requestId；旧启动状态、仅网络在线、VM 任务刚创建均不能作为上传依据。

### 5.2 状态查询与静态显示

`talMpyGetStudioState()` 返回 JSON 字符串，字段：`protocol: 1`、`mode: "MpyReplMode"`、`requestId`、`wifiConnected`、`maopaoConnected`、`ip`、`port: 8266`、`replReady`、`error`。

先显示现有 Python Dev 图标；Wi-Fi 和冒泡连接后启动 REPL。成功执行 boot.py，并验证 WebREPL listener 存在后，在同一 MPY framebuffer 上绘制一次白色 LOADING，再发布 replReady。字形参考 install_app_with_loading.py，只使用静态文字，不启动线程或呼吸点。之后不再因网络变化重绘屏幕；用户 MPY 直接覆盖同一缓冲，无需通知固件停止动画。不绘图的应用保留 LOADING，实际运行状态在 Studio 查看。

Studio 明确报错时结束部署，不自动回到 Home。网络未连通保留图标等待；设备仍保留关机/普通重启能力。普通手动 REPL 的入口、CLI 使用和 Home 恢复行为保持原样。

设备必须使用支持这两个 RPC 的新固件；当前实现不自动回退旧重启流程。详细代码清单与验收项见 [Studio 专用 REPL 模式](STUDIO-REPL-MODE.md)。

## 6. WebREPL 连接与密码

连接地址为 `ws://<设备IP>:8266/`，Studio 后台持有连接。

首版统一使用内置预设密码 **`pixelmug`**：

- 不提供用户密码设置入口。
- 自动等待 Password 提示、发送密码并确认认证成功。
- WebSocket open 不等于 WebREPL 已认证。
- 认证失败时提示“设备 WebREPL 密码与预设不一致”，不自动覆盖设备配置。
- 不把密码写入调试日志，也不传给 WebApp。

一台设备只允许一个 WebREPL 客户端。Studio 连接时，现有 VS Code WebREPL 插件或其他终端需断开。Studio 按设备维护独立连接，支持多设备同时开发。

连接解析器要处理分片、控制字符、文本与二进制帧。先认证、再探测命令执行、再做清理上传，不采用固定延时后直接发送文件的方式。

## 7. 工作区清理：删除文件，不格式化分区

**最终确认方案：保留根目录 `/boot.py` 和 `/webrepl_cfg.py`，递归删除其他所有文件和目录。**

不执行 mkfs，不卸载或重新挂载分区。这取代讨论中“格式化并重建启动文件”的备选方案。

原因及约束：

- 固件将 `mpy` 分区挂载为根目录 `/`。
- `boot.py` 负责启动 WebREPL；`webrepl_cfg.py` 保存认证配置。
- 每次进入 REPL 会检查并补建缺失文件，不会无条件覆盖已有文件。
- 两个文件由固件维护，Studio 不覆盖、不重写。
- 只保护根目录下的这两个路径，子目录中的同名文件仍删除。
- 其他应用代码、资源、数据、旧引导文件全部清除，不保留上一轮应用运行数据。
- 清理通过 REPL 执行 MicroPython 文件系统操作，WebREPL PUT 协议本身没有目录删除操作。
- 清理前必须确认没有应用执行和文件传输；任一步删除失败即停止，不带着旧文件继续部署。

本地上传清单若包含根目录 `boot.py` 或 `webrepl_cfg.py`，在清理设备之前报冲突。不要静默覆盖或跳过后声称完整部署。

## 8. 文件上传与统一引导程序

### 8.1 项目文件

首版采用逐文件上传，暂不打包解压：

- 源目录为项目 `mpy/`。
- 排除该目录下的 `dist/` 子树。
- 保留其余源码、资源文件及相对目录结构。
- 不允许路径穿越或通过符号链接读取项目范围以外的文件。
- 在设备上创建目录并串行上传。
- 等待每个文件的协议完成响应，并核对文件大小。
- 全部文件验证成功后才允许启动。

当前 WebREPL 协议的文件名缓冲区为 64 字节，需保留字符串终止空间。按 UTF-8 字节检查路径；可通过切换目标工作目录缩短上传路径，不允许截断文件名后上传。

上传失败时标记任务失败，不运行半成品。下一轮重新执行完整重启、清理、上传流程。

### 8.2 Studio 引导文件

每次同时上传 Studio 管理的统一引导程序，建议保留名称：

```text
/__studio_bootstrap__.py
```

该名称为设计命名，编码时可调整；项目不能覆盖最终确定的保留路径。引导程序由 Studio 提供，不要求开发者手动编写。

引导程序负责：

1. 设置工作目录与模块搜索路径。
2. 携带当前 launchId 等关联信息。
3. 在开始执行入口时输出可识别的控制消息。
4. 以 `__name__ == "__main__"` 等正确执行上下文运行入口。
5. 保留真实文件名和行号，避免 traceback 全部变成 `<string>`。
6. 捕获并输出异常堆栈，报告运行失败。
7. 区分正常结束、异常退出和人工中断。

入口统一为项目根的 **`__main__.py`**，不是 `_main_`，也不自动猜测 `main.py`。如果以后支持自定义入口，另行增加明确的项目配置。

引导控制消息必须带任务关联标识，与普通 print 日志区分。不能靠搜索任意日志中的 “running” 单词判断启动成功。

引导文件不是 `boot.py`：它在本轮上传校验完成后由 Studio 显式执行，不设置为每次开机自动启动。

## 9. RPC 返回、进度与运行事件

保留各 SDK 入口原有公开契约，不强行统一 bot 和 WebApp 原本不同的响应封装。

| 层次 | 含义 |
| --- | --- |
| 传输受理 | Studio 已接受控制请求，不表示设备已运行 |
| RPC 业务响应 | 对应 talMpyExecOneScript 当前调用的返回 |
| 后续设备事件 | 准备、开始执行、失败等状态 |
| 日志 | 运行输出、堆栈及诊断，不能替代控制确认 |

新建并受理真实启动任务后，可以使用原有 `262` 表示本轮需要准备应用。WebApp 可见形态沿用原契约，例如：

```json
{ "code": 200, "result": { "value": 262 } }
```

`262` 是业务返回值，不能拿它替换外层 RPC 的 `code: 200`。在调试路径中，它用于进入准备流程，不是对设备正式安装数据库的查询结果。

同一构建已确认在该设备运行时可返回 `264`；没有确认时不得返回“已运行”。

bot 同步调用仍按原约定返回最终 RPC 响应；异步调用保留 ACK/任务返回及后续完成或失败事件，不把 HTTP 响应直接替代原任务对象。

### 9.1 MPS_IS_RUNNING 是后续事件

新任务的 RPC 返回准备状态后，Studio 继续部署。设备端引导确认开始执行入口时，再交付现有事件：

```text
mpyVmEvent
  params.value = "MPS_IS_RUNNING"
```

它不是同一 RPC Promise 的第二次返回。

Studio 适配层将 Studio 的状态转换并送入原有设备事件入口，使现有 Loading 和业务事件监听无需增加调试分支。事件必须包含正确设备上下文，匹配调用方的订阅范围。

当前固件正式流程在调用入口脚本之前紧邻的位置设置 MPS_IS_RUNNING；调试路径保持“开始执行”的含义，不承诺应用初始化成功、首帧出现、音频已播放或业务符合预期。

准备/上传失败对应准备阶段失败，运行异常对应 `RUNNING_FAIL`；如映射 `INSTALL_START`、`INSTALL_SUCCESS`、`INSTALL_FAIL`，分别以实际准备开始、工作区部署完成、部署失败为依据。原始异常和具体阶段记录到 Studio，不能伪造成功进度。

事件订阅需早于可能到达的就绪事件，或提供当前任务状态恢复，避免快速启动造成漏事件。仅向授权的相关调用方/订阅者交付，不向无关项目或设备广播。

### 9.2 超时与源码运行结束

重启、上线、连接、认证、清理、上传、启动分别设置超时。RPC 响应超时与整个部署等待超时是不同层次。

既有应用可能有固定的启动等待时间；需用真实项目验证完整重启与部署耗时，并明确兼容策略，不能仅扩大 Studio 内部超时就认为调用方也会持续等待。

正常退出、异常退出及设备断连应分别记录。WebSocket 断开只表示连接丢失，不能直接判定应用已经停止或仍在运行。

## 10. MPY 日志汇总

```text
设备 MicroPython print / traceback
→ 设备 WebREPL WebSocket
→ Studio 后台接收、解析
→ 本地 debug/ 持久化
→ Studio 页面展示
```

开发者继续使用 print；不用额外添加日志发送代码。

复用现有日志展示与持久化，但新增 `source: "mpy"` 以及 deviceId、launchId 等关联字段。当前接收端已增加独立的 mpy 来源，不把 MPY 冒充 bot 来源。

保留可读的原始 REPL 输出，结构化日志中区分普通输出、异常和 Studio 操作诊断。不要无依据地把所有 print 推断成特定业务级别。

要求：

- 支持跨 WebSocket 帧的 UTF-8 与换行拼接。
- 正确区分文件传输响应、REPL 控制字符、引导控制消息和应用日志。
- 每台设备独立解析，不能串行混用其他设备的响应。
- 应用运行时主要持续接收输出，不与上传/清理命令并发。
- 不把凭据或认证输入作为日志保存。

当前固件通过 dupterm 转发 MicroPython 输出；不保证所有底层 C/C++ printf、ESP 日志均经 WebREPL 返回。原生阻塞、掉电、强制重启时最后一段日志可能丢失。此限制需要在真机验收中明确，不能宣称覆盖所有固件日志。

## 11. 代码组织建议与现有依据

建议将 Studio 后端职责分为：

- Launch 协调器：请求校验、去重、设备锁、阶段状态与回传。
- 冒泡 RPC 执行适配器：设备重启、Wi-Fi 信息、REPL 启动。
- WebREPL 客户端：连接、自动认证、命令、文件传输、输出解析。
- 部署器：清单、工作区清理、上传、校验、引导启动。
- 日志适配器：将 MPY 输出加入现有日志存储与 UI。

这不要求创建多个服务或进程，都可以在本地 Studio 后台实现。

已有代码依据：

- [SDK WebApp 调用](../../mps/jeejio-bubble/sdk/WebApp.js)
- [SDK bot 调用](../../mps/jeejio-bubble/sdk/BubbleBot.js)
- [当前 Node preload](runtime/studio-preload.js)
- [设备 REPL 启动 RPC](../../main/PixelCup/service/mpyVM/repl/talMpyStartREPL.cpp)
- [设备系统 RPC](../../main/PixelCup/service/System/talSystem.cpp)
- [REPL 根分区挂载](../../components/mpy_vm/mpy/ports/esp32/modules/_boot_dev.py)
- [启动文件补建](../../components/mpy_vm/mpy/ports/esp32/modules/inisetup.py)
- [MicroPython REPL 运行入口](../../components/mpy_vm/mpy_vm.c)
- [WebREPL 服务](../../components/mpy_vm/mpy/lib/micropython-lib/micropython/net/webrepl/webrepl.py)
- [WebREPL 文件协议](../../components/mpy_vm/mpy/extmod/modwebrepl.c)
- [已有 WebREPL 工具](../pixelmug_webrepl/src/extension.ts)
- [现有应用启动状态等待示例](../../mps/audio-visualizer/webapp/src/template/mpsLaunch.ts)

现有 VS Code 工具的文件协议可抽取复用，但需要移除 VS Code UI 依赖，并补齐自动认证、命令执行确认、超时与状态恢复。

## 12. 开发顺序与验收

建议按以下顺序推进：

1. SDK 精确分流与控制协议，验证正式模式及其他 RPC 不变。
2. 双向结果/事件适配，保留同步、异步契约。
3. 真机重启、获取 IP、进入 REPL、自动认证。
4. 工作区清理、逐文件上传与引导执行。
5. MPY 日志持久化和界面展示。
6. 重复请求、失败恢复及多设备验收。

需要覆盖的验收场景：

- bot、WebApp 两端发起启动；bot 同步/异步入口。
- 正式模式与 Studio 模式切换；其他 RPC 始终走原链路。
- Studio 模式下 MPS ID/版本缺失、为空或不同仍启动当前项目；改变参数不切换项目、不触发云端下载、不改变去重结果。正式模式参数处理保持原样。
- 每个新任务先重启，重复请求不重复重启。
- 设备重新上线、IP 改变、模式切换、错误密码、WebREPL 被占用。
- 只保留两个根目录启动文件，嵌套旧文件及旧引导代码全部清理。
- 项目包含目录、资源、大文件、中文路径及超长路径。
- 上传中断、存储空间不足、清理失败时不执行半成品。
- 入口缺失、语法错误、运行异常、正常结束、持续运行。
- 就绪事件顺序正确，既有 Loading 能结束并正确显示失败。
- 图像、音频、BLE 等实际组件运行期间的日志接收。
- 两台 PixelMug 同时开发，设备、状态、日志和事件不串线。
- WebApp 刷新、客户端断线、Studio 退出时的任务状态和恢复行为。

辅助 RPC 执行器已确定为本地 bot。后续细化事项：控制消息结构与事件订阅传输、各阶段超时、冲突任务排队/拒绝策略、源码快照和文件校验方案、引导执行及 traceback 实现。上述事项不能改变本文已确认的专用分流、每轮先重启、保留两个文件清理、固定密码和显式入口执行原则。



## 无需安装 RPC 的首次设备运行

Studio 调试环境启动后，Studio 的 bot 适配器恢复项目内已保存的会话查询线索，调用现有 `getBoundDevices` 从 `/bot/detail` 查询实际绑定；有结果则注册设备执行上下文，无结果等待用户绑定。首次没有会话线索时，普通会话消息即可触发查询。`sendBindDevice` 保持发送卡片的行为，完成绑定后的 `message:bind_device` 触发重新查询，开发者的原事件监听继续执行。

绑定设备与部署任务分开维护。PC 页面可以对尚未创建 launch 的绑定设备执行“运行 MPY”；服务端 `runBinding` 根据 bot 注册的上下文进入原部署流程，每次运行重新校验账号授权及 bot 绑定。应用主动调用 `talMpyExecOneScript` 仍兼容原去重逻辑。

新增内部控制操作：仅 bot 可以调用 `bindingScopes` 读取本 bot 的会话线索、`syncBindings` 同步某会话的完整绑定快照。成功空快照移除绑定及执行上下文，失败查询不发送空快照。已知会话每 15 秒刷新；同一作用域的查询串行，避免旧响应覆盖新绑定。

新增代码：Studio `runtime/StudioBindings.js` 管理发现和恢复，`StudioLaunch.js` 维护稳定的绑定订阅；Studio `bindings.mjs` 管理绑定列表与 `debug/studio-binding-scopes.json`。磁盘仅存会话线索及 bot 身份摘要，不保存 token 或可直接复用的设备绑定。启动恢复必须重新查询服务端。两端其它业务接口和固件无需因此改变。
