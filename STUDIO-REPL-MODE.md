# Studio 专用 REPL 启动模式

> 当前模块归属以 [SDK 与 Studio 边界](SDK-BOUNDARY.md) 为准：所有 Studio 专用接入均由 `tools/studio/runtime` 和 `devices` 承担。下述设备运行协议保持不变。

## 行为

仅 Studio 的 MPY 调试部署使用本通路。原 `talMpyStartREPL`、`mpyStartREPL` 任务入口及手动 WebREPL/CLI 保持原有行为。

1. Studio 的 `launchId` 作为本次 `requestId`，通过本地 bot 调用 `talMpyRebootStartREPL`。
2. 固件将请求写入 NVS 独立键 `studioBoot`，确认写入后创建延时约 300ms 的重启任务。返回 true 表示已接受，false 表示未受理。不能把返回 true 当作重启完成。
3. 系统启动时消费该键。只有已绑定、正常运行模式且不处于电池保护/OTA 启动时进入 `mpyReplModeSetup`。不改变持久化 runningMode，不改变旧 `MPY_BOOT_INTENT_REPL`。下一次普通重启回到正常模式。
4. 新模式不创建 Home、不开机动画、不启动正常模式的 motion/Home/weather 任务。保留电源、按键、网络、冒泡、TAL、时间服务。MPY VM 本身的 BLE、音频、传感器绑定能力沿用现有实现。
5. 创建 REPL framebuffer，绘制现有 Python Dev 图标。网络和冒泡连接后，专用任务调用底层 `startMpyREPLtask`。
6. VM 完成 boot.py，执行冻结的 `_studio_repl_check.py` 检查 WebREPL listener。仅 Studio 提供的启动完成回调绘制一次 LOADING 并发布 `replReady`；旧手动 REPL 的回调为空，不执行新检查。
7. Studio 查询 `talMpyGetStudioState`，核对本次 requestId、模式、协议、网络、就绪状态和 IP，再连接认证、清理、上传和运行入口。

## 静态显示

Python Dev 使用现有 `mpyReplBitmap`。LOADING 使用 `install_app_with_loading.py` 的 4 像素高微型字形，白字黑底，字间距 1，文字本身居中。不使用动画点、线程、定时刷新或动画停止通知。

两次绘制使用同一个 MPY framebuffer。LOADING 绘制发生在 VM 进入 REPL 命令循环之前，之后固件不再因为网络状态或应用日志重画它。用户 MPY 自行清屏/绘图；不绘图的应用会保留 LOADING，Studio 的运行状态和日志用于确认执行结果。硬件显示扫描与应用动画不同，仍由原显示调度器运行。

## RPC 契约

`talMpyRebootStartREPL` 参数：`{"requestId":"<launchId>"}`，限定 1–100 个字母、数字、下划线或连字符；返回布尔值。

`talMpyGetStudioState` 无参数，返回 JSON 字符串，例如：

```json
{"protocol":1,"mode":"MpyReplMode","requestId":"<launchId>","wifiConnected":true,"maopaoConnected":true,"ip":"192.168.1.10","port":8266,"replReady":true,"error":""}
```

未进入 Studio 模式时返回的 mode/requestId 不匹配本次启动，Studio 继续等待。`replReady` 表示启动时 WebREPL listener 已建立，不表示用户应用已运行，也不是运行期间的 WebSocket 存活指标。明确的启动 error 立即结束部署。

SDK 只允许这两个辅助 RPC，并仅向重启 RPC 转发校验后的 requestId。辅助 RPC 仍通过 bot → 冒泡服务器 → 设备；WebApp 页面的生命周期不影响已受理部署。其它业务 RPC 不改变路由。

## 错误和恢复

- 重启响应丢失：只查询本次启动，不重发重启。SDK 按 commandId 缓存执行结果。
- 收到旧 requestId 或未就绪：继续等待，不连接/清理设备。
- Wi-Fi 或冒泡未连通：设备保留 Python Dev 等待；Studio 等待超时后报告失败。
- VM 启动失败：状态查询返回错误，保留开发界面，不创建 Home。
- 运行中的 WebREPL 断连：设备应用继续按原逻辑运行；不重画 LOADING、不主动重启。
- 普通重启/退出 REPL：一次性请求已消费，回到正常模式。Studio 再次部署必须发新的专用请求。
- 旧固件不支持新 RPC：本实现不自动回退普通重启和手动 REPL 流程。需烧录新固件。

## 代码位置

| 位置 | 用途 |
| --- | --- |
| main/PixelCup/runtime/boot/PixelCupModeMpyRepl.cpp/.h | 独立模式初始化、内存模式状态、查询结果 |
| main/PixelCup/runtime/boot/PixelCupRuntimeCommon.cpp/.h | Normal/Studio 共用的小型初始化函数 |
| main/PixelCup/runtime/boot/PixelCupBoot.cpp | 消费一次性请求并分流 |
| main/PixelCup/nvs/KVstore.cpp/.h | 一次性请求存储与消费 |
| main/PixelCup/service/mpyVM/repl/talMpyStudio.cpp/.h | 专用重启和状态 RPC |
| main/PixelCup/service/mpyVM/repl/mpyStudioREPLTask.cpp/.h | 无 Home 的 REPL 管理任务 |
| main/PixelCup/service/mpyVM/repl/mpyReplDisplay.cpp/.h | 共用 framebuffer 和静态显示 |
| main/PixelCup/service/mpyVM/repl/mpyREPLLocalTask.cpp | 旧入口仅复用提取的显示函数 |
| components/mpy_vm/include/mpy_vm.h、mpy_vm.c | 可选启动完成回调 |
| components/mpy_vm/mpy/ports/esp32/modules/_studio_repl_check.py | 校验实际 listener |
| main/PixelCup/runtime/buttonEvent/the2Buttons.cpp | 新模式 VM 未就绪时忽略 Home 手势 |
| main/PixelCup/connectMaopao.cpp、declareFunctions.h、main/CMakeLists.txt | RPC 与源文件注册 |
| tools/studio/runtime/StudioLaunch.js | 辅助方法白名单、requestId 转发 |
| tools/studio/launch.mjs | 专用重启、启动身份和就绪检查 |

电源管理现有代码对 Home 句柄有空值检查；新模式沿用特殊任务活动通知，无需修改该文件。原 `talMpyStartREPL.cpp/.h` 未修改。

## 验证与手动验收

自动测试覆盖 bot IPC、WebApp 发起后关闭页面、多设备部署、请求标识传递、旧启动标识拒绝、等待 listener 就绪、启动错误和丢失重启回包不重复重启。

固件由开发者手动编译、烧录。烧录后停止并重新启动 Studio 后台，重新启动调试环境，然后在 minimal-mps 中发起运行：

1. 首次启动及“重新运行设备”均为 Python Dev → LOADING → 应用，无开机动画/Home/动态 Loading。
2. 暂时断开 Wi-Fi，确认图标等待；恢复网络后能继续接入。应用开始后网络重连不覆盖应用画面。
3. 两个设备同时启动，requestId、状态及日志相互独立。
4. 普通重启恢复正常模式；重新发起 Studio 部署再次进入专用模式。
5. 正常模式手动调用原 talMpyStartREPL，连接 WebREPL CLI、执行代码及退出，确认原流程不变。
6. 检查应用按键、BLE、音频及 g-sensor；确认无 Home 模式保留应用所需能力。


## 无需安装 RPC 的首次设备运行

Studio 调试环境启动后，Studio 的 bot 适配器恢复项目内已保存的会话查询线索，调用现有 `getBoundDevices` 从 `/bot/detail` 查询实际绑定；有结果则注册设备执行上下文，无结果等待用户绑定。首次没有会话线索时，普通会话消息即可触发查询。`sendBindDevice` 保持发送卡片的行为，完成绑定后的 `message:bind_device` 触发重新查询，开发者的原事件监听继续执行。

绑定设备与部署任务分开维护。PC 页面可以对尚未创建 launch 的绑定设备执行“运行 MPY”；服务端 `runBinding` 根据 bot 注册的上下文进入原部署流程，每次运行重新校验账号授权及 bot 绑定。应用主动调用 `talMpyExecOneScript` 仍兼容原去重逻辑。

新增内部控制操作：仅 bot 可以调用 `bindingScopes` 读取本 bot 的会话线索、`syncBindings` 同步某会话的完整绑定快照。成功空快照移除绑定及执行上下文，失败查询不发送空快照。已知会话每 15 秒刷新；同一作用域的查询串行，避免旧响应覆盖新绑定。

新增代码：Studio `runtime/StudioBindings.js` 管理发现和恢复，`StudioLaunch.js` 维护稳定的绑定订阅；Studio `bindings.mjs` 管理绑定列表与 `debug/studio-binding-scopes.json`。磁盘仅存会话线索及 bot 身份摘要，不保存 token 或可直接复用的设备绑定。启动恢复必须重新查询服务端。两端其它业务接口和固件无需因此改变。
