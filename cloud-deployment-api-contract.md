# PixelMug Cloud Deployment API Contract (MVP)

本文定义 PixelMug Studio 与部署控制服务之间的最小接口。MVP 暂不考虑登录鉴权、account_id 和 Idempotency-Key。接口默认运行在受控的开发环境或内部网关之后，后续可以增加鉴权和幂等字段。

## 1. 基本约定

Base URL：

    /api/cloud

请求和响应默认使用 UTF-8 JSON。项目包上传接口使用 multipart/form-data。时间统一使用 UTC ISO 8601。

资源对象的 ID 由服务端生成。MVP 中一个 Deployment 同时只运行一个 Release 和一个 Runtime。

Deployment URL 在创建时根据 deployment_id 确定：

    https://<deployment-id>.dev.pixelmug.com

停止或重启不会改变 URL。删除 Deployment 后 URL 失效。

## 2. 状态和阶段

Deployment 状态：

    requested
    uploading
    provisioning
    bootstrapping
    deploying
    running
    stopping
    released
    failed

Operation 状态：

    queued
    running
    succeeded
    failed

异步阶段：

    request
    upload
    provisioning
    bootstrapping
    deploying
    health_check
    stopping
    releasing

只有进入 running 后，Lease 才开始计时。进入 released 后结束计时并完成资源释放。

## 3. 创建 Deployment

请求：

    POST /api/cloud/deployments
    Content-Type: application/json

请求体：

    {
      "project_id": "project-001",
      "region": "us",
      "runtime": "node20",
      "runtime_size": "small",
      "mps_id": "mps-001",
      "mps_version": "1.0.0"
    }

字段：

- project_id：Studio 项目标识，必填；
- region：目标区域，必填；
- runtime：Node 运行时版本，MVP 支持 node20；
- runtime_size：运行规格，MVP 支持 small；
- mps_id：通过 mps_pack 打包并上传的 MPS 项目唯一标识，必填；
- mps_version：要下载并安装到设备的 MPS 项目版本，必填。

响应：

    HTTP 202 Accepted

    {
      "deployment": {
        "deployment_id": "dep-001",
        "project_id": "project-001",
        "status": "requested",
        "webapp_url": "https://dep-001.dev.pixelmug.com",
        "mps_id": "mps-001",
        "created_at": "2026-10-14T08:00:00Z",
        "updated_at": "2026-10-14T08:00:00Z"
      },
      "operation": {
        "operation_id": "op-001",
        "type": "create",
        "status": "queued",
        "stage": "request",
        "status_url": "/api/cloud/operations/op-001"
      }
    }

创建 Deployment 和稳定 URL 不代表 VM 已申请成功，也不代表应用已经运行。

## 4. 直接上传项目包

MVP 直接上传，不使用预签名 URL。

请求：

    POST /api/cloud/deployments/{deployment_id}/releases
    Content-Type: multipart/form-data

表单字段：

- project：项目 zip 文件，必填；
- manifest：云端项目清单 JSON 文件，必填；
- release_id：可选；省略时由服务端生成。

示例清单：

    {
      "manifest_version": 1,
      "node_version": "20",
      "package_manager": "npm",
      "install_command": "npm ci",
      "start_command": ["node", "bot/index.js"],
      "webapp_source": "webapp",
      "webapp_output": "webapp-dist",
      "dependencies": {
        "@jeejio-bubble/bot": "0.1.8"
      },
      "private_registry": {
        "url": null,
        "token_secret": null
      },
      "environment": {
        "PUBLIC_APP_MODE": "demo",
        "PRIVATE_APP_KEY": "secret:project-key"
      }
    }

响应：

    HTTP 202 Accepted

    {
      "release": {
        "release_id": "rel-001",
        "deployment_id": "dep-001",
        "status": "uploading",
        "created_at": "2026-10-14T08:00:05Z"
      },
      "operation": {
        "operation_id": "op-002",
        "type": "deploy",
        "status": "queued",
        "stage": "upload",
        "status_url": "/api/cloud/operations/op-002"
      }
    }

该清单由 Studio 在部署时生成，服务端只接受清单中允许的字段。node_version 固定为 Node 20 LTS；package_manager 固定为 npm；install_command 固定为 npm ci；start_command 固定为 node 加项目入口文件。Studio 会根据当前版本自动补入精确版本的 @jeejio-bubble/bot，并生成或校验 package-lock.json。项目包不应包含 node_modules 或 debug 目录。

WebApp 在云端构建，使用与 Studio 匹配的构建器和 SDK 版本，构建输出为 webapp_output，再由运行时网关托管。云端执行 npm ci --ignore-scripts，不允许项目清单自定义任意安装脚本。项目可以声明额外环境变量，但不能覆盖平台变量；secret 类型变量只允许引用受控秘密名称，不能在清单中写入实际值。

私有 npm 源可以使用。private_registry 只保存 registry 地址和秘密引用，认证 Token 由运行时注入。若项目没有 package-lock.json，Studio 必须在上传前生成有效锁文件；服务端不在部署节点临时解析未锁定的依赖。

## 5. 查询异步 Operation

请求：

    GET /api/cloud/operations/{operation_id}

响应：

    HTTP 200 OK

    {
      "operation_id": "op-002",
      "type": "deploy",
      "status": "running",
      "stage": "bootstrapping",
      "progress": 55,
      "deployment_id": "dep-001",
      "release_id": "rel-001",
      "message": "Installing Node dependencies",
      "started_at": "2026-10-14T08:00:06Z",
      "updated_at": "2026-10-14T08:00:32Z",
      "finished_at": null,
      "error": null
    }

成功时 status 为 succeeded，stage 为 health_check，progress 为 100，error 为 null。失败时 status 为 failed，并返回 error.code、error.message、error.stage 和 error.retryable。

Studio 轮询 status_url。建议初始间隔 1 秒，之后逐步增加到 5 秒；服务端不要求 Studio 保持长连接。

## 6. 查询 Deployment

请求：

    GET /api/cloud/deployments/{deployment_id}

响应字段至少包含：

    {
      "deployment_id": "dep-001",
      "project_id": "project-001",
      "release_id": "rel-001",
      "status": "running",
      "webapp_url": "https://dep-001.dev.pixelmug.com",
      "mps_id": "mps-001",
      "mps_version": "1.0.0",
      "provider": "provider-a",
      "runtime_id": "vm-001",
      "lease_id": "lease-001",
      "started_at": "2026-10-14T08:00:00Z",
      "ready_at": "2026-10-14T08:00:42Z",
      "elapsed_seconds": 3618,
      "traffic": {
        "network_rx_bytes": 184320,
        "network_tx_bytes": 92160,
        "public_rx_bytes": 184320,
        "public_tx_bytes": 92160,
        "sampled_at": "2026-10-14T09:01:00Z",
        "meter_source": "provider"
      },
      "runtime_config": {
        "config_version": 1,
        "deployment_id": "dep-001",
        "project_id": "project-001",
        "release_id": "rel-001",
        "region": "us",
        "generated_at": "2026-10-14T08:00:42Z",
        "environment": {
          "BOT_API_BASE_URL": "runtime",
          "BOT_TOKEN": "secret",
          "STUDIO_WEBAPP_URL": "runtime",
          "STUDIO_MPS_ID": "runtime",
          "STUDIO_MPS_VERSION": "runtime"
        }
      },
      "operation": null,
      "error": null
    }

runtime_config 只返回配置版本、部署关联和环境变量名称。API 地址、WebApp 地址、MPS ID、MPS 版本和 Bot Token 的实际值都不通过此接口返回，也不写入项目包、Docker 镜像或持久化配置。运行时由受控启动器注入 Bot 进程环境变量：

| 运行参数 | Bot 环境变量 | 是否保存实际值 |
|---|---|---|
| API 地址 | BOT_API_BASE_URL | 否，运行时注入 |
| Bot token | BOT_TOKEN | 否，通过秘密注入 |
| WebApp 地址 | STUDIO_WEBAPP_URL | 否，运行时注入 |
| MPS ID | STUDIO_MPS_ID | 否，运行时注入 |
| MPS 版本 | STUDIO_MPS_VERSION | 否，运行时注入 |

项目代码通过环境变量读取这些值。bubble-mps.json 由启动器读取，只用于校验和声明需要的变量，不能作为项目代码读取运行参数或秘密的途径。配置更新后必须重启 Bot，确保整个进程使用同一套参数。

Studio 的标准变量名以 BOT_TOKEN、BOT_API_BASE_URL 和 STUDIO_WEBAPP_URL 为准。现有 ambient-clock 示例中的 WEBAPP_URL 可以作为兼容别名；该示例当前仍从 config.dev.js 读取 Bot token、API 地址、MPS ID 和版本，接入云端部署前需要改为读取上述标准环境变量。BUBBLE_BOT_TOKEN 目前只出现在错误提示文字中，不作为实际注入变量。

## 7. 停止、重启和删除

停止：

    POST /api/cloud/deployments/{deployment_id}/stop

响应：

    HTTP 202 Accepted

    {
      "deployment_id": "dep-001",
      "operation": {
        "operation_id": "op-003",
        "type": "stop",
        "status": "queued",
        "stage": "stopping",
        "status_url": "/api/cloud/operations/op-003"
      }
    }

停止依次停止 Bot 和 WebApp、结束 Lease 计时、删除容器、释放或销毁 VM，最终状态为 released。

重启：

    POST /api/cloud/deployments/{deployment_id}/restart

重启使用原 Deployment 和稳定 URL，但创建新的 Lease 和 Operation。重启成功后重新生成或确认 bubble-mps.json，并从 ready_at 重新开始计时。

删除：

    DELETE /api/cloud/deployments/{deployment_id}

服务端应先执行停止和资源释放，再将 Deployment 标记为 deleted。MVP 不要求恢复已删除 Deployment。

## 8. 错误响应

统一结构：

    {
      "error": {
        "code": "BUILD_FAILED",
        "message": "npm ci failed",
        "stage": "deploying",
        "retryable": false,
        "operation_id": "op-002",
        "details": {
          "log_id": "log-001"
        }
      }
    }

错误码和 HTTP 状态：

| HTTP | code | stage | 含义 |
|---|---|---|---|
| 400 | INVALID_REQUEST | request | 请求字段缺失或格式错误 |
| 404 | DEPLOYMENT_NOT_FOUND | request | Deployment 不存在 |
| 409 | DEPLOYMENT_BUSY | request | 当前 Deployment 正在执行另一个互斥操作 |
| 413 | PROJECT_TOO_LARGE | upload | 项目包超过大小限制 |
| 422 | PROJECT_PACKAGE_INVALID | upload | zip 结构、路径或 manifest 无效 |
| 422 | MANIFEST_INVALID | upload | 项目清单字段不合法 |
| 503 | PROVISION_FAILED | provisioning | 云厂商无法申请或启动 VM |
| 503 | BOOTSTRAP_FAILED | bootstrapping | VM 初始化或 Docker 安装失败 |
| 422 | BUILD_FAILED | deploying | 依赖安装、WebApp 构建或项目构建失败 |
| 422 | BOT_START_FAILED | deploying | Bot 进程启动后退出或配置缺失 |
| 504 | HEALTH_CHECK_TIMEOUT | health_check | Bot 或 WebApp 在规定时间内未就绪 |
| 502 | PROVIDER_API_ERROR | provisioning/releasing | 云厂商 API 返回错误 |
| 504 | OPERATION_TIMEOUT | any | 操作超过平台超时时间 |
| 503 | STOP_FAILED | stopping | 应用未能停止 |
| 503 | RELEASE_FAILED | releasing | VM 未能释放，需要后台重试 |

Studio 控制面板至少展示：阶段、message、错误码、是否可以重试、日志入口。

例如：

- PROVISION_FAILED：云端资源申请失败，请稍后重试；
- BUILD_FAILED：项目依赖安装或构建失败，请查看构建日志；
- BOT_START_FAILED：Bot 启动失败，请检查入口文件、环境变量和 Bot Token；
- HEALTH_CHECK_TIMEOUT：应用未在规定时间内就绪，平台将回收运行资源。

message 不能包含 Token、密钥或完整的云厂商内部错误。

## 9. 日志接口

请求：

    GET /api/cloud/deployments/{deployment_id}/logs?source=all&cursor=...

source 支持 all、platform、build、bot、webapp、mpy。

响应：

    {
      "deployment_id": "dep-001",
      "items": [
        {
          "timestamp": "2026-10-14T08:00:32Z",
          "source": "build",
          "level": "info",
          "message": "Installing Node dependencies"
        }
      ],
      "next_cursor": null
    }

日志必须过滤敏感信息。接口可以只保留最近一次 Release 和当前 Lease 的日志。

## 10. 网络流量计量

运行时间和网络流量分开计量。Deployment 查询响应中的 traffic 至少包含：

- network_rx_bytes：运行环境收到的累计字节数；
- network_tx_bytes：运行环境发出的累计字节数；
- public_rx_bytes、public_tx_bytes：可选的公网方向累计字节数；
- sampled_at：最近一次采样时间；
- meter_source：provider、VM interface 或 container。

MVP 中一个 Deployment 对应一个 VM，服务端优先使用 Provider 的 VM 网络计数，并由运行节点 Agent 定期采样校验。停止或释放前必须执行最后一次采样。只记录字节数和计量元数据，不记录网络内容。

Studio 可以展示当前累计流量和最终流量，但 MVP 不按流量扣款。服务端应保留采样事件，处理计数器归零、节点重启和重复上报。未来共享 VM 时，必须改用容器网络命名空间、cgroup 或 eBPF 做 Deployment 级采集，不能把整台 VM 的流量分摊给项目。

## 11. MVP 最小闭环

1. POST /deployments；
2. POST /deployments/{id}/releases，直接上传 zip 和 manifest；
3. 轮询 GET /operations/{operation_id}；
4. 展示 running 状态、webapp_url、mps_id、elapsed_seconds 和 traffic；
5. 必要时查询 logs；
6. POST /deployments/{id}/stop；
7. 轮询停止 Operation，直到 released。

MVP 暂不实现登录、account_id、Idempotency-Key、预签名上传、多项目共享 VM 和自动扣款。接口保留后续增加这些能力的空间。

