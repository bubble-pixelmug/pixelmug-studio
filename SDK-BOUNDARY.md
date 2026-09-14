# Jeejio Bubble SDK 与 Studio 的边界

## 职责

`mps/jeejio-bubble/sdk` 是通用冒泡 Bot / WebApp SDK，仅保留正常消息、设备绑定查询、设备 RPC、WebApp 会话和 BLE 等能力。SDK 不导入 PixelMugS1，不认识 Studio、runId、IPC 控制协议或 MPY 部署。不使用 Studio 的应用不加载 Studio 代码。原有 console 输出及 debug 详细程度选项保持不变。

Studio 是 SDK 的使用方。所有调试运行支持放在 `tools/studio`：

| 文件 | 职责 |
| --- | --- |
| `runtime/studio-preload.js` | Node 入口预加载，读取本次子进程配置 |
| `runtime/BotAdapter.js` | 在实际 bot 类上接入启动/停止、绑定观察、WebApp 准备请求、设备调用分流 |
| `runtime/WebAppAdapter.js` | 包装实际 WebApp 类，仅分流 `talMpyExecOneScript` |
| `runtime/StudioBindings.js` | 恢复查询线索、消息触发查询、绑定变更同步及停止清理 |
| `runtime/StudioLaunch.js` / `StudioLaunchNode.js` | Studio 控制协议、订阅及 HTTP / IPC 传输 |
| `runtime/StudioDebug*.js` | console 和异常采集、脱敏、队列、日志传输 |
| `devices/pixelmug.js` | 导入 PixelMugS1，通过设备 SDK 构造辅助 RPC，映射 MPY 事件 |
| `receiver.mjs` / `launch.mjs` / `bindings.mjs` | 接收日志、托管 WebApp、协调设备部署及记录运行状态 |

设备 SDK 的 `devices/PixelMugS1_1.0.js` 继续维护设备方法定义，通用 SDK 不反向依赖它。

## 如何保持应用透明

Node 仍由 Studio 使用 `node --import` 预加载，在业务入口创建 bot 之前安装适配器。适配器使用开发者现有 bot 的 API、消息队列与分发器，不创建第二个 bot，不重复领取服务器消息。

SDK 的 `callDevice` / `callDeviceAsync` 已恢复直接使用 `api.sendDeviceRpc`。Studio 包装它们，在 AsyncLocalStorage 中保存本次调用的设备和选项，并在实际 API 实例的发送点分流。并发的不同会话或设备不共用临时目标。普通 RPC 委托原实现；Studio 调用失败不回退到正式安装。原有校验、等待器、ACK 和异步任务处理继续由 SDK 执行，不复制这些业务实现。

WebApp 仍显式在业务入口之前初始化调试支持：

```html
<script src="/studio-debug-config.js"></script>
<script type="module">
  import { enableStudioDebugFromPage } from "/studio-runtime/StudioDebugWeb.js";
  enableStudioDebugFromPage();
  await import("./main.js");
</script>
```

`/sdk/` 仅提供通用浏览器 SDK，`/studio-runtime/` 仅白名单提供 Studio 浏览器模块。Node 适配器、设备模块、preload 不对手机发布。配置和凭据仍遵循既有调试会话规则。

## 兼容边界

当前适配器面向本仓库 SDK。Node 预加载与应用必须引用同一个 BubbleBot 模块；WebApp 使用 `/sdk/WebApp.js`，Studio 的 `sdk-web.js` 服务端出口也解析到同一 URL。另一个 SDK 副本或业务 bundle 中内嵌的 SDK 不会被自动接管。适配器也提供接受实际类的安装函数，未来发布包应由 Studio 的版本适配层统一对接。

原型包装集中在两个 Adapter 中，安装幂等。未启用 Studio 时不安装；关闭调试传输后设备调用回到普通路径。升级 SDK 必须验证这些方法契约，不能假定任意版本兼容。现有 `system.studio.prepareMps` 协议保留，由 Studio 适配器处理，通用 SDK 不增加对应内建请求。

SDK 不需要新增日志传输接口：已有 console 是采集边界；以后如需结构化日志回调，只能增加与 Studio 无关的通用订阅能力。

## 本次保持的行为

- 应用设备绑定仍由冒泡 App 和 bot 管理；启动恢复、普通消息查询、绑定事件及周期同步不变。
- 仅 `talMpyExecOneScript` 进入本地启动通道，正式调用和其它 RPC 保持原路径。
- 同步返回、异步 ACK / response 顺序及 MPY 事件保持原契约；Studio 忽略 MPS id / version。
- 辅助 RPC 全部在 bot 执行，调用前仍查询绑定；WebApp 离开不影响已受理部署。
- 设备启动、WebREPL 上传与运行、日志格式、存储目录和 PC UI 不变。
- 不修改固件或应用业务入口。已有 WebApp 调试引导需把导入路径从 `/sdk/StudioDebugWeb.js` 改为 `/studio-runtime/StudioDebugWeb.js`；仓库两个示例已更新。

## 验证

通用 SDK 测试在 `mps/jeejio-bubble/sdk`；日志、绑定、启动适配测试迁移到 `tools/studio/test`，由 Studio 自己运行。另有边界检查与并发调用回归测试，验证通用 SDK 无 Studio/具体设备依赖，以及 Studio 多设备调用上下文不串线。硬件行为仍需用户真机验证。
