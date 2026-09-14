# Studio debug 日志接入

Studio 日志采集与 `new BubbleBot(token, { debug: true })` / `new BubbleWebApp({ debug: true })` 分开：`debug` 控制 SDK 自身输出多少日志；Studio 配置决定是否把 console 复制给本地接收端。

业务代码继续使用 `console.log/info/warn/error/debug`。可主动打印关键参数和处理结果。Studio 不会自动识别业务逻辑是否正确，也不会自动生成请求调用链。

## Bot：由 Studio 在入口之前开启

使用本地接收端的 `--bot` 启动入口即可，业务代码无需增加初始化。启动器在子进程上设置 `PIXELMUG_STUDIO_DEBUG`，并通过 Node `--import` 加载 `tools/studio/runtime/studio-preload.js`。配置只传给本次启动的子进程。

自定义 Node 启动器也可以显式调用：

```js
import { enableStudioDebug } from "./tools/studio/runtime/StudioDebugNode.js";

const studioDebug = enableStudioDebug({
  enabled: true,
  runId: "接收端本轮 runId",
  endpoint: "http://127.0.0.1:8787/api/logs",
  token: "PC Studio 的会话凭据", // 不是 bot token；手机端上报凭据不能上报 bot 来源
  secrets: [process.env.BOT_TOKEN],
});
await import("./bot.js");
```

显式 HTTP 接入需由启动器提供匹配的会话参数；正常使用推荐 Studio 的自动 preload + IPC。不要在源码中硬编码或提交会话凭据。

Node 不安装 `uncaughtException` 或 `unhandledRejection` 处理器，只监听 `uncaughtExceptionMonitor`；保留默认退出码和 stderr。非默认 Node rejection 策略下，未触发 monitor 的警告可在 stderr 副本中查看。直接退出或强制终止时，不保证队列中的结构化记录全部送达。

## WebApp：在业务模块加载前开启

在 Studio 托管的开发页面中：

```html
<script src="/studio-debug-config.js"></script>
<script type="module">
  import { enableStudioDebugFromPage } from "/studio-runtime/StudioDebugWeb.js";
  enableStudioDebugFromPage();
  await import("./main.js");
</script>
```

必须先初始化再动态加载业务入口，才能捕捉入口加载和初始化期间的日志。Studio 生成的完整 WebApp 地址含本轮上报凭据。配置脚本读取后移除地址栏中的该 fragment 参数，暂存在 sessionStorage。普通不带配置的页面不会自动连接 Studio。

也可以由其他开发服务注入配置后调用：

```js
import { enableStudioDebug } from "/studio-runtime/StudioDebugWeb.js";

const studioDebug = enableStudioDebug({
  enabled: true,
  runId: config.runId,
  endpoint: config.endpoint,
  token: config.token,
});
```

当前接收端仅支持同源浏览器访问；其他开发服务需把日志 API 代理到 Studio 并配合接收端的 Host/Origin 配置，不能直接依赖通配跨域。正式部署不注入 Studio 配置、不包含开发配置脚本。

## 公共选项与行为

| 选项 | 说明 |
| --- | --- |
| enabled | 必须显式为 true；否则不安装 console 包装、不发网络请求 |
| runId | 接收端生成的本轮运行标识 |
| endpoint / token | HTTP 接收地址和调试会话凭据，IPC 无需 endpoint |
| buildId | 可选，调用者提供的代码版本标识 |
| clientId | 默认随机生成，区分多次页面打开/进程运行 |
| flushInterval | 默认 250ms，最小 50ms |
| maxQueue | 默认 500，限制在 20–2000 条之间 |
| secrets | 除常见字段脱敏外，需要替换的已知敏感字符串，至少 4 字符 |

同一运行环境重复初始化返回已有实例，避免重复包装；切换会话前先 `await studioDebug.dispose()`。实例提供 `flush()` 尝试发送当前队列，`dispose()` 停止采集、恢复 console 并尝试发送剩余记录。若断网，发送失败不会抛进业务代码；定时重试期间沿用 clientId/seq，接收端去重。dispose 后不会继续重试。

原 console 继续输出。Error 记录保留堆栈；对象采集为当时的受限快照，支持循环引用和 BigInt，不执行 getter。深度、大小和队列有限制，超大内容会截断；它不是完整对象存储。SDK 捕捉初始化之后的五类 console，以及 WebApp 未捕获异常和未处理 Promise rejection；不包装所有 console 方法，也不拦截网络请求。

CloudLog 及其 Kafka/SLS 配置、依赖已删除，不再读取旧的 CLOUD_LOG 配置。旧应用需移除 CloudLog import / installConsole 等调用，改用上述开发启动初始化。这些初始化方法只属于 Studio，不再从 SDK 根入口导出。浏览器从 `/studio-runtime/StudioDebugWeb.js` 导入；Node 由 Studio 预加载 `runtime/studio-preload.js`。

完整测试和运行步骤见 [Studio demo](examples/studio-debug/README.md)。

## MPS 真机调试启动

开启 Studio 初始化后，会同时安装 talMpyExecOneScript 专用启动适配。WebApp callDevice、bot callDevice/callDeviceAsync 调用该方法时，使用当前本地项目，忽略 MPS ID/版本；其他 RPC 沿用原冒泡链路。目标设备必须出现在 Studio 本地 --devices 配置中。

这不是新的业务调用 API，不需要业务代码手动调用 studioLaunchMps。Node 通过 preload 自动接入，WebApp 沿用本文的早期初始化。辅助重启/Wi-Fi/REPL RPC 全部由本地 bot 执行。WebApp 首次启动通过内置系统请求向 bot 准备设备上下文；任务受理后不再依赖页面保活，PC 重跑只需本地 bot 在线。详细使用见 [真机 MPS 示例](../../../tools/studio/examples/minimal-mps/README.md)。


### Studio 自动发现设备绑定

调试模式下，bot SDK 自动查询已有会话绑定，在 `message:bind_device` 后强制刷新，并每 15 秒刷新已知会话。应用无需增加新接口，现有绑定事件监听照常执行。查询到绑定后 Studio 可直接运行 MPY，不要求先调用 `talMpyExecOneScript`。重启通过项目 debug 目录中的会话线索恢复查询，不直接信任旧绑定；首次无会话线索时收到一条普通消息即可查询。

## 模块边界

日志序列化、console 包装、会话配置、IPC/HTTP 传输和启动适配均由 Studio 运行层提供。通用 SDK 保留现有 console 输出与普通 `debug` 详细程度选项，不需要导入 Studio。业务 WebApp 应使用 Studio 提供的 `/sdk/WebApp.js` 模块，使适配层与业务代码共享同一个类实例；Node 使用仓库当前的 BubbleBot 模块。自带另一份 SDK 或打包内嵌 SDK 的项目需要显式适配，不能仅凭开启日志就保证设备启动分流。详见 [SDK-BOUNDARY.md](SDK-BOUNDARY.md)。
