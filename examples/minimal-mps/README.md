# Studio 最小真机 MPS 测试

设备 MPY 调试需要烧录包含 `talMpyRebootStartREPL`、`talMpyGetStudioState` 的新固件，并重启 Studio 后台加载新 SDK/启动流程。新固件显示静态 Python Dev → 静态 LOADING → 应用画面，不经过 Home；原手动 WebREPL 通路仍保留。详见 [专用模式](../../STUDIO-REPL-MODE.md)。

设备屏幕显示 STUDIO、计数和移动方块，每秒向 Studio 输出一条 MPY 心跳。额外的 `message.txt` 用于验证资源上传；`mpy/dist/` 不上传。

micropyxel 用法以仓库 `mps/mpy-examples` 为准，基础结构参考 `tutorial/simple.py`、`tutorial/hello.py`：导入 `micropyxel as pyxel`，回调接收 `rt`，通过 `on_exit(rt, reason, exc)` 清理 `pyxel.destroy()`。当前布局按 32×16 屏幕安排，方块位置使用 `pyxel.width` / `pyxel.height` 计算。

该示例只使用真实 PixelMug，没有模拟器。每个新的调试任务都会重启设备，并清除 mpy 分区上除根目录 `boot.py`、`webrepl_cfg.py` 外的全部文件和应用数据。

## 使用基础工作台

推荐运行 `node tools/studio/server.mjs --host <电脑局域网 IP>`，不带 `--project`。打开输出的 Studio URL，登录后通过“打开目录”选择本示例目录，填写 bot token，确认入口 `bot/index.js` 和 WebApp 目录 `webapp`，点击“开始调试”。已有绑定时无需重复 `/bind`：Studio 会恢复已知会话并查询绑定。首次使用可以在冒泡 App 发 `/devices`，未绑定再用 `/bind`。看到 Studio 的“运行 MPY”后可以直接点击运行，不必先发 `/run`；`/run` 和 `/webapp` 仍可正常测试。

工作台自动获取登录用户的绑定设备并校验在线状态，无需 `devices.local.json`。下面保留的是旧命令行接收端的运行步骤；它没有登录入口，仍使用手工列表。

## 1. 安装本地依赖

在 PixelMug 仓库根目录执行，Node.js 20.6+：

```powershell
npm --prefix mps/jeejio-bubble ci
npm --prefix tools/studio ci
```

Studio 新增了 WebSocket 依赖 `ws`；不再是完全无依赖的日志接收脚本。

## 2. 获取绑定设备信息

在同一终端设置 bot token，启动示例；IP 换成电脑当前局域网 IP：

```powershell
$env:BOT_TOKEN = "你的 bot token"
# 使用非默认 API 时再设置：
# $env:BOT_API_BASE_URL = "你的 API 地址"
node tools/studio/server.mjs --project tools/studio/examples/minimal-mps --bot bot/index.js --host 172.16.30.5
```

在冒泡 App 中向这个 bot 发送：

- `/bind`：需要时绑定设备。
- `/devices`：查看实际的 `deviceId`、`slotId`。
- `/webapp`：打开页面，也可查看这些标识。

未提供设备授权配置时，日志与设备查询正常工作，启动请求会被拒绝，不会重启或清理设备。

## 3. 配置允许调试的设备

复制本目录的 `devices.example.json` 为 `devices.local.json`，替换为上一步得到的真实值：

```json
[
  { "deviceId": "真实设备ID", "slotId": "实际绑定槽位ID" }
]
```

多设备添加多行；每台设备使用自己的 ID 和槽位 ID。这里的 slotId 是绑定记录 ID，不是数字槽位顺序 `1`。配置文件以 UTF-8 保存。

按 Ctrl+C 停止程序，然后启动：

```powershell
node tools/studio/server.mjs --project tools/studio/examples/minimal-mps --bot bot/index.js --host 172.16.30.5 --devices devices.local.json
```

`--devices` 相对于 `--project` 解析。手机、电脑与设备应处于可互通的局域网，允许 Node 的局域网入站连接。先断开其他 WebREPL 客户端；Studio 使用内置密码 pixelmug，不提供密码配置入口。

## 4. 体验启动

1. PC 打开终端新输出的 Studio URL。
2. 在冒泡 App 重新发送 `/webapp`，打开本轮链接。
3. 选择设备，点击“启动当前本地 MPS”。
4. 在 Studio 观察 rebooting → connecting → uploading → uploaded → running。
5. 设备显示动画，Studio 的 `mpy` 来源出现资源内容和心跳。

也可以从 bot 发起：

- `/run`：启动第一台绑定设备。
- `/run <deviceId>`：指定设备。
- `/runasync`：测试 bot 异步调用契约。

示例的 MPS ID 和版本故意为空，Studio 调试通道会忽略它们，始终部署本目录 `mpy/`。

同一份源码已运行时再次调用会返回 264，不重新部署。PC Studio 的“重新运行”按钮则明确创建新任务并重启设备。辅助 RPC 全部交由本地 bot 执行。WebApp 发起的任务受理后，即使页面关闭或手机息屏，部署及 PC 重新运行也能继续；需要保持本地 bot 进程运行。

## 5. 查看文件与测试失败

```text
debug/<runId>/
  events.jsonl / events.log       # 三端合并日志
  launch-<uuid>/
    launch.json                  # 目标设备、源码指纹、状态、错误
    source/                      # 本轮上传的项目源码快照
    deploy.log                   # 重启/部署阶段记录
    mpy.log                      # 应用输出，按需创建
```

编辑器和 Agent 可以直接读取。认证输入与引导协议控制标记不会作为普通日志输出。

可在 `mpy/__main__.py` 中临时添加 `raise RuntimeError("test failure")` 后重新运行，验证失败事件及堆栈；测试完成后删除该语句。上传失败不会执行半成品。

普通 `print` 和 traceback 可收集；底层 C/ESP 日志不保证全部进入 WebREPL。设备断线后显示 unknown，不能据此判断应用已经停止。Studio 退出只断开连接，不通过未经确认的操作停止仍运行的设备程序。

## 当前验证范围

自动化测试覆盖 SDK 同步/异步分流、HTTP 与 IPC 控制回路、WebSocket WebREPL 协议、认证失败、部署状态、文件保护和上传失败。测试中的协议对端仅用于测试，不是产品模拟器。

尚需你在真实 PixelMug 和冒泡 WebView 中执行上面的验收；自动化通过不等于硬件已经运行成功。重启后的上线确认目前采用等待窗口加新的设备 RPC 响应，不依赖缓存 online 标志；异常重启、较慢 Wi-Fi 和原生模块行为仍需真机验证。

