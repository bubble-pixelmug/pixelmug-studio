# Deploy application 功能设计（第一版）

## 设计原则

部署页面以服务器为中心。Studio 同一时间只打开一个当前项目，但开发者可以拥有多台服务器，并在不同服务器上同时运行不同项目。服务器上的部署项目独立于 Studio 当前打开的项目。

开发阶段 Studio 使用 `8787`，本地 Deployment Service 使用 `8788`。用户只看到自己已申请的服务器，不看到资源池数量、节点 IP 或云厂商信息。

## 页面结构

左侧导航增加 **Deploy application**。页面只包含 **My servers**。

页面标题区域始终显示 **Apply server** 按钮。无论当前已有零台、一台还是多台服务器，该按钮都保持可见。点击后弹出授权码对话框，第一版服务端只验证授权码非空。

## Server 列表

每个 server 使用一个简洁的标签或卡片，只保留状态和当前部署项目的概览信息，不放操作按钮。

每个 server 标签显示：

- 服务器名称或编号
- 状态：`Idle`、`Loading`、`Deploying`、`Running`、`Stopping`、`Error`、`Offline`
- 当前部署项目名称
- 使用的 Bot 名称
- MPY 名称
- MPY 版本
- MPS ID
- 预留字段：运行时间、开始时间、资源用量等

空闲 server 的项目字段显示 `No project deployed`。如果 server 正在运行一个与当前 Studio 项目不同的项目，列表仍然显示 server 实际运行的项目。

示例：

```text
My server 1                         Idle
No project deployed

My server 2                         Running
Project: Ambient Clock
Bot: ambient-clock-bot
MPY: Ambient Clock / 1.0.3
MPS ID: mps-ambient-clock
```

点击 server 标签后，打开或展开对应的 **Server details**。同一时间可以只展开一个详情面板。

## Server details

所有操作都放在 Server details 中，列表卡片不直接执行操作。

### 空闲 server

详情面板显示：

- `Load current project`
- 当前 Studio 项目加载后的项目信息
- 项目组成：Bot、WebApp、MPY
- 当前项目使用的 Bot
- MPS ID
- 从 `mpy/mps.json` 读取的 MPY 名称和版本

点击 `Load current project` 后，Studio 将当前打开的项目加载到该 server。加载完成后，在 Server details 中显示 MPS ID 输入框：`MPS ID: [                         ] [Save]`。用户需要填写或确认 MPS ID，保存成功后才可以执行 `Create deployment` 和 `Upload release`。MPS ID 属于该 server 当前加载的项目状态。

### 已加载但未部署

详情面板显示：

- `Reload current project`
- `Create deployment`
- `Upload release`
- `Query status`

`Reload current project` 只在没有运行中的 Deployment 时可用。

### 已部署 server

详情面板展示 server 实际运行的项目和完整状态：

- 项目名称和组成
- Bot
- MPY 名称、版本和 MPS ID
- Release ID
- Deployment 状态
- WebApp URL
- 未来的运行时间和资源用量

可用操作：

- `Query status`
- `Stop`
- 查看操作日志

如果当前运行项目不是 Studio 当前打开的项目，显示提示：

```text
This server is running another project.
Stop the current deployment before loading the project opened in Studio.
```

用户必须先点击 `Stop`，等待 server 回到 `Idle`，之后才可以加载当前 Studio 项目。

## 服务器部署流程

```text
Apply server
    ↓
Idle server → open Server details
    ↓ Load current project
Project information appears in Server details
    ↓ Create deployment
Reserved / Deploying
    ↓ Upload release
Building / Configuring HTTPS
    ↓
Running
```

## 项目信息来源

点击 `Load current project` 时，Studio 从当前打开的项目读取：

- 项目名称和目录组成：`bot/`、可选 `webapp/`、可选 `mpy/`
- 项目设置中用于运行和调试的 Bot
- `mpy/mps.json` 中的 MPY 名称和版本
- 用户填写或保存的 MPS ID

部署页面不维护独立的 Project releases 列表。项目发布信息属于 server 的详情状态，并随服务器的加载、部署和停止状态显示。

## 接口

开发阶段 Deployment Service URL 为 `http://127.0.0.1:8788`，正式环境替换为 HTTPS 域名。

- `POST /api/cloud/servers/apply`
- `POST /api/cloud/deployments`
- `GET /api/cloud/deployments/:deployment_id`
- `POST /api/cloud/deployments/:deployment_id/releases`
- `POST /api/cloud/deployments/:deployment_id/stop`

## 本地状态和安全

Studio 按 server 保存 `server_id`、当前 `deployment_id`、`project_id`、`mps_id`、`mps_version`、`webapp_url`、`status` 和 `last_error`。这些状态不能用当前打开项目的信息覆盖已部署项目。

Bot token 只在上传发布包时传给部署服务，不显示在界面中，也不写入项目清单或 `bubble-mps.json`。

## 第一版边界

暂不包含真实授权码计费、多用户账户、用户查看 VM 池容量、一台 VM 多 Deployment、云厂商选择和流量计费。

