# PixelMug 开发者云端部署设计（MVP）

## 1. 目标

为 PixelMug Studio 增加一键部署能力。开发者在 Studio 中选择项目后，平台自动申请一台轻量 VM，准备 Node 运行环境，启动 Bot 和 WebApp，并生成 Bot 运行时配置。配置中包含 WebApp URL 和 MPS ID；运行 Bot 前，启动器读取配置并设置与本地 Studio 一致的环境变量，项目代码通过 Bot SDK 使用这些环境变量完成 WebApp 和设备操作。

VM 不是开发者长期独占的资源。平台以“部署”为单位申请运行资源并计时：部署启动时租用或创建 VM，部署停止、删除、过期或发生不可恢复故障时立即释放 VM。开发者在使用期间看到的是隔离的运行环境，但平台可以从共享资源池分配 VM，也可以按需临时创建 VM。

MVP 的运行模型：

- 一个 Deployment 对应一个项目和一个运行租约（Lease）。
- 一个 Lease 同一时刻只使用一个运行环境。
- VM 只在部署运行期间占用和计量。
- Deployment 停止后立即停止并释放 VM，不保留“开发者专属 VM”。
- 平台记录每次部署的实际运行时长，为后续收费提供依据。
- Studio 只调用平台部署 API，不持有云服务商凭据。

## 2. 非目标

MVP 不负责在开发者本地复刻云端基础设施、让 WebApp 直接连接 Bot VM、允许任意公网端口、提供在线 IDE/数据库/高可用集群，或立即完成扣款。第一版只做准确、可审计的用量计量。

## 3. 核心概念

Project：Studio 中的项目。
Release：项目的一个可部署版本。
Deployment：某个 Release 的一次部署实例。
Lease：Deployment 对运行资源的租约。
Runtime：Lease 当前使用的实际运行环境，可由 VM 或 VM 上的容器承载。
Meter：记录 Lease 的运行时长和网络流量等可计量用量。

account_id、project_id、release_id、deployment_id 和 lease_id 必须分开保存，区分同一项目的多次发布和一次运行，并在 VM 回收后保留完整记录。

## 4. 总体架构

PixelMug Studio → 部署控制服务 → Provider Adapter → 云服务商 A / 云服务商 B / 自有或整租 VM 资源池 → Deployment Runtime

Bot 通过 InlineKeyboard 的 URL 引导用户打开 Deployment 的 WebApp；WebApp 通过 jeejio Bubble WebApp SDK 与 Bubble Server 通信，再由 Bubble Server 将消息转发给 Bot。Bot 不需要单独的公网 API 域名，只需要出站网络和 WebApp HTTPS 入口。

## 5. 与云服务商解耦

部署控制服务不把任何一家云厂商的 VM API、网络模型或计费字段暴露给 Studio，统一使用以下能力：

    RuntimeProvider
      acquire(lease_spec)       # 从资源池租用或创建 VM
      bootstrap(runtime)        # 安装基础运行环境
      release(runtime)          # 停止并释放 VM
      status(runtime)
      logs(runtime)

acquire 可以从按小时计费的供应商临时创建 VM，也可以从平台预先整租的 VM 资源池分配空闲 VM，还可以分配自有机房或其他基础设施节点。实现方式对 Studio 和部署 API 保持一致。

以后整租一批 VM 后，平台可以把 VM 成本作为内部成本，再按 Deployment 的时长、规格和附加服务向开发者零售，而不修改 Studio 的项目格式和操作流程。

Provider Adapter 应抽象资源规格（CPU、内存、磁盘、区域、架构）、申请/启动/停止/释放、网络入口、成本计费粒度、初始化状态和健康状态。

## 6. 运行环境方案

### 6.1 推荐：VM 上运行按部署隔离的 Docker 容器

推荐在 VM 上安装 Docker，每个 Deployment 使用独立容器。VM 是资源承载层，容器是项目运行和依赖隔离层：

    临时或整租 VM
    └── Docker
        └── deployment-<id> container
            ├── Node.js
            ├── @jeejio-bubble/bot
            ├── package.json / package-lock.json
            ├── Bot 代码
            └── WebApp 构建产物

这样可以锁定 Node 版本和镜像，避免本地能跑、云端不能跑；停止时删除容器即可清理进程、临时文件和端口；同一台整租或共享 VM 将来可以承载多个 Deployment；迁移云厂商时只需重新执行 VM 初始化和容器启动。

VM 初始化用脚本完成：安装 Docker、配置日志和网络、注册运行节点、下载基础镜像。容器由平台为每次 Deployment 创建和销毁。若供应商不支持 Docker，可以提供脚本运行时适配器，但必须有独立工作目录、Node 进程、端口、资源限制和完整清理流程，不作为默认实现。

### 6.2 本地 Studio 与云端环境的差异

Studio 安装包内置了 @jeejio-bubble/bot，因此本地项目可以直接运行。云端 VM 不应假定拥有 Studio 的 node_modules，也不应复制 Studio 安装目录中的依赖。每次部署建立干净环境：

1. Studio 读取项目中的 package.json 和源文件，生成云端有效清单；开发者不需要手工维护这份清单。
2. 清单固定使用 Node 20 LTS 和 npm，必须包含 package-lock.json。项目已有锁文件时由 Studio 校验；没有锁文件时，Studio 在部署前生成有效锁文件。云端一律执行 npm ci。
3. Studio 将 @jeejio-bubble/bot 以与当前 Studio 匹配的精确版本自动加入有效依赖。项目声明的其他依赖也必须进入 package.json 和锁文件。
4. Studio 上传项目源代码、package.json、package-lock.json 和清单。项目包不包含 node_modules、debug 或临时构建目录。
5. 云端使用固定 Node 20 镜像执行 npm ci --ignore-scripts。默认不允许项目执行任意 preinstall、install、postinstall 或 prepare 脚本，必要的构建能力由平台镜像提供。
6. WebApp 在云端构建，使用与 Studio 一致的构建器和 SDK 版本；构建产物再由运行时网关托管。这样不依赖开发者电脑上的构建结果。
7. 项目可以声明额外环境变量，但必须使用非保密值或受控的 secret 引用，且不能覆盖 BOT_TOKEN、BOT_API_BASE_URL、STUDIO_WEBAPP_URL、STUDIO_MPS_ID 和 STUDIO_MPS_VERSION 等平台变量。
8. 私有 npm 源允许使用。清单只声明 registry 地址和 secret 引用，认证 Token 由运行时注入，不写入项目包、锁文件、镜像或日志。
9. 启动项目，并通过健康检查确认 Bot 已连接 Bubble 服务。MicroPython 设备端代码继续按现有流程自动下载和解压，本设计不改变该流程。

云端不使用开发者电脑的 Node 版本、全局 npm 包、环境变量或本地 node_modules。有效清单是可重复构建的部署输入；原始项目 package.json 可以保持简单，但不能替代云端有效清单。

## 7. 用户体验

开发者在 Studio 中登录、选择设备、打开项目并点击“部署到云端”。Studio 显示申请资源、准备环境、安装依赖、启动应用等进度，平台返回 Bot 运行时配置和运行计时。云端启动器读取该配置，设置与本地 Studio 一致的环境变量（当前至少包括 `STUDIO_WEBAPP_URL`）；项目代码从环境变量读取值并调用 Bot SDK，具体调用时机和交互方式由项目代码决定。开发者可以更新、停止、重启或删除 Deployment。

“停止”停止应用、结束计时并立即释放 VM；“重启”重新申请或分配运行资源，再启动同一个 Deployment；“更新”在同一个 Deployment 下创建新的 Release，并在新版本健康检查通过后切换流量。

推荐 WebApp URL： https://<deployment-id>.dev.pixelmug.com

该 URL 在创建 Deployment 时根据 `deployment_id` 确定，是项目代码调用 Bot SDK 时使用的用户 WebApp 入口，不是 Bubble App 直接加载的入口。项目代码可以将 SDK 返回的 WebApp 入口放入自己的消息或按键交互中。URL 不绑定某一台永久存在的 VM：停止期间 URL 可以暂时不可用，重新启动时通过反向代理或域名记录指向新的 VM，但 URL 保持不变。只有删除 Deployment 时，URL 才失效；重新创建一个 Deployment 会得到新的 URL。

## 8. VM、容器与 HTTPS

运行节点可以使用 VM 上的 Caddy，也可以使用云端统一网关：

    https://deployment-id.dev.pixelmug.com
             ↓
    平台网关或 VM 上的 Caddy:443
             ↓
    Deployment 容器中的 WebApp

网关负责 HTTPS 证书、静态文件、SPA fallback、压缩、安全响应头和当前 Deployment 路由。需要允许 Bubble App 嵌入 WebApp，不能无条件设置 X-Frame-Options: DENY，应使用 Content-Security-Policy: frame-ancestors 配置允许的 Bubble 来源。

公网只开放 443；SSH 仅用于平台运维或受控管理通道。Bot 不直接暴露公网端口。

## 9. 部署控制服务

服务负责创建 Deployment/Lease，选择 Provider，申请或分配 VM，初始化运行节点，分配稳定 URL，接收项目包，执行部署、更新、停止、重启和释放，保存状态、日志和用量，并在异常退出、超时或心跳丢失后回收资源。Studio 不直接持有云厂商高权限 Token。

服务还负责生成版本化的 Bot 启动配置约定。该文件只描述配置版本、部署关联和需要注入的环境变量名称，不保存运行参数的实际值，也不放入项目包或 Docker 镜像。至少包含：

- config_version：bubble-mps.json 的结构版本，当前为 1；
- deployment_id、project_id、release_id；
- region：运行区域；
- generated_at：配置生成时间；
- environment：需要注入 Bot 的环境变量名称和来源标记。

Bot 启动前由启动器加载配置文件并校验所需环境变量。云端运行时直接注入：`BOT_API_BASE_URL`、`BOT_TOKEN`、`STUDIO_WEBAPP_URL`、`STUDIO_MPS_ID` 和 `STUDIO_MPS_VERSION`。这些变量的实际值不写入 bubble-mps.json、项目包、Docker 镜像或普通日志。项目代码只从环境变量读取这些值，再调用 Bot SDK 的相应接口。

建议使用版本化的 `bubble-mps.json`，示例：

    {
      "config_version": 1,
      "deployment_id": "dep-001",
      "project_id": "project-001",
      "release_id": "release-20261014-001",
      "region": "us",
      "generated_at": "2026-10-14T08:00:42Z",
      "environment": {
        "BOT_API_BASE_URL": "runtime",
        "BOT_TOKEN": "secret",
        "STUDIO_WEBAPP_URL": "runtime",
        "STUDIO_MPS_ID": "runtime",
        "STUDIO_MPS_VERSION": "runtime"
      }
    }

该文件可作为容器内的只读启动约定文件。Bot 启动器先校验 `config_version` 和必需环境变量，再启动项目。项目代码通过环境变量获取 WebApp、API、MPS ID 和版本后调用 Bot SDK。Deployment 身份只用于部署控制服务管理这次运行，不作为 Bot 后续每次 SDK 调用的必需参数。环境变量可以由容器运行时或受控启动器注入，bubble-mps.json 不保存它们的实际值。

`mps_id` 不是单个设备 ID，也不是设备组 ID，而是 MPS 项目的唯一标识。开发者在 Studio 中填写 MPS 项目 ID 和版本，并使用 mps_pack 打包、使用 mps token 上传；部署运行时通过 `STUDIO_MPS_ID` 和 `STUDIO_MPS_VERSION` 环境变量提供这两个参数，设备运行逻辑据此下载和安装 MPS 代码。mps token 是上传凭据，不进入运行时配置，也不注入 Bot。

配置更新后必须重启 Bot。重启可以确保新的 WebApp 地址、API 地址、MPS ID 或 MPS 版本在进程启动时完整生效，避免同一个 Bot 进程同时使用两套运行参数。

这里的 `config_version` 指 `bubble-mps.json` 的字段结构版本，不是项目的 `release_id`，也不是 Bot 或 SDK 的版本。例如当前版本要求存在环境变量声明和 deployment 元数据；以后如果字段改名、嵌套结构改变或环境变量映射改变，启动器可以根据版本选择解析方式。启动器应只接受自己支持的版本，遇到缺失或不支持的版本时，在启动 Bot 前报告配置不兼容，避免把错误字段静默地映射成环境变量。MVP 只有一个配置结构时仍可保留该字段，当前值为 `1`；如果以后长期不会演进，也可以改成只校验必需字段。

## 10. 主要 API

MVP 的完整请求、响应、异步 Operation、错误码和日志接口见 [cloud-deployment-api-contract.md](cloud-deployment-api-contract.md)。本设计文档只保留架构层面的 API 说明；接口实现应以该契约为准。

创建部署并申请租约：

    POST /api/cloud/deployments

请求至少包含 account_id、project_id、release_id、region、runtime（如 node20）和 runtime_size。服务端返回 deployment_id、lease_id 和异步任务状态；申请资源不能被误认为应用已运行。

上传和部署项目：

    POST /api/cloud/deployments/{deployment_id}/releases

项目包可通过预签名 URL 上传对象存储，再由运行节点下载。

查询状态和计时：

    GET /api/cloud/deployments/{deployment_id}

返回应包含 deployment_id、lease_id、status、provider、runtime_id、project_id、release_id、runtime_config_uri（只包含配置元数据和环境变量映射）、webapp_url、mps_id、mps_version、started_at、ready_at 和 elapsed_seconds。运行参数实际值通过运行时环境变量注入，不通过配置下载接口返回。

## 11. 部署流程

1. Studio 创建 Deployment 并上传 Release。
2. 控制服务调用 Provider.acquire(lease_spec)。
3. Provider 租用、创建或分配 VM。
4. 平台初始化 VM，安装 Docker 和运行节点。
5. 创建 Deployment 容器，安装 Node 依赖。
6. 启动器加载 Bot 运行时配置，设置环境变量，启动 Bot 和 WebApp，并执行健康检查。
7. 健康检查通过后生成或确认配置，返回配置地址、URL、MPS ID 和 ready_at，并开始计时。
8. 项目代码从环境变量读取运行参数并调用 Bot SDK；用户按项目定义的交互打开 WebApp，WebApp 通过 Bubble SDK 通信。
9. 停止时停止并删除容器，调用 Provider.release(runtime)，停止或回收 VM，返回最终运行时长。

部署必须有版本号。新版本失败时保留旧版本；只有健康检查通过后才标记为 running 并开始可计费计时。

## 12. 运行计时与未来计费

第一版把计量和收费解耦：先准确记录用量，不立即扣款。计时对象是 Lease，不是开发者账号或项目。

- requested_at：创建请求时间，仅用于排队和性能分析；
- provisioning_started_at：开始申请或分配 VM；
- ready_at：容器、Bot 和 WebApp 检查通过，默认计费起点；
- stopped_at：应用停止且不再接受请求；
- released_at：VM 已停止或回收到资源池；
- 默认可计费时长为 released_at - ready_at，并按供应商要求向上取整到分钟或小时；
- 若供应商从 VM 创建时开始收费，另行保存 provider_billable_started_at，不能把供应商成本和开发者使用时长混为一个字段。

停止、删除、发布新版本替换旧版本、达到最长运行时长、配额不足或心跳超时，都会结束 Lease。释放动作必须幂等，避免重复扣费或重复销毁资源。

Studio 显示当前状态、运行开始时间、实时已运行时长、最近一次最终时长，以及未来计费所需的规格、区域和计量单位。平台保存不可变的 lease_ready、lease_stopped、runtime_released 等用量事件，汇总可以重算，不能只依赖 Studio 本地计时器。

所有时间以服务端 UTC 为准；使用心跳、最长运行时长和异常回收任务；部署、停止和释放使用幂等键；定期对账 VM、容器和 Lease；日志和计量记录不得泄露敏感配置。

### 12.1 网络流量计量

运行时长和网络流量是两个独立的计量维度。每个 Lease 至少记录：

- `network_rx_bytes`：运行环境收到的字节数；
- `network_tx_bytes`：运行环境发出的字节数；
- `public_rx_bytes` 和 `public_tx_bytes`：可选的公网方向计数，用于匹配云服务商的网络计费；
- `network_sampled_at`：最近一次采样时间；
- `network_meter_source`：采集来源，例如 provider、VM interface 或 container。

MVP 是一个 Deployment 对应一个 VM，因此优先使用云服务商的 VM 网络计数器，并由运行节点 Agent 定期采样校验。采集应排除 loopback 流量和平台管理通道，具体是否计入内网流量由 Provider Adapter 统一转换。不能读取或保存网络 payload，只记录字节数、方向、时间和来源。

当多个 Deployment 共享一台 VM 时，不能继续使用整台 VM 的计数器作为项目用量；应改用容器网络命名空间、cgroup 或 eBPF 按 Deployment 采集。Provider 的公网出口计费数据仍作为成本对账依据，项目级计量和供应商成本必须分开保存。

运行节点每 30～60 秒上报一次累计计数，停止或释放前执行最后一次采样。服务端使用单调递增计数器处理重启、计数器归零和重复上报，最终用量由采样事件重算。MVP 先记录并展示流量，不立即按流量扣款；未来可以按公网出口字节数、区域和供应商价格建立独立的流量计费项，并设置配额、告警和超额策略。

## 13. VM 规格与资源池

建议从 2 vCPU、2～4 GB RAM、40～80 GB SSD、Linux、1 个公网 IPv4 或统一网关入口开始，并要求 API 创建/停止/销毁、Docker 和固定 Node LTS 镜像支持。

资源可以来自按小时临时租用的 VM，也可以来自平台整租后建立的 VM 资源池。选择供应商重点考察 API 自动化、网络质量、IPv4 费用、启动速度、快照能力、Docker 支持和计费明细，而不是只比较月租价格。

## 14. 数据模型

deployment：

    id, account_id, project_id, current_release_id
    stable_webapp_url, status, created_at, updated_at

deployment_lease：

    id, deployment_id, provider, provider_runtime_id
    region, runtime_size, status
    requested_at, provisioning_started_at, ready_at
    stopped_at, released_at
    provider_billable_started_at, provider_billable_ended_at
    elapsed_seconds, metering_unit
    network_rx_bytes, network_tx_bytes
    public_rx_bytes, public_tx_bytes
    network_sampled_at, network_meter_source
    created_at, updated_at

project_release：

    id, account_id, project_id, release_id
    artifact_uri, manifest_uri, status, build_log, created_at

usage_event：

    id, lease_id, event_type, event_at, server_time
    elapsed_seconds, network_rx_bytes, network_tx_bytes
    public_rx_bytes, public_tx_bytes, metadata

不再使用“一个账号绑定一台 VM”的模型。一个账号可以有多个历史 Deployment 和 Lease；一个 Lease 只关联一个运行资源；资源释放后 provider_runtime_id 作为历史记录保留。

## 15. 安全设计

- 云厂商 Token 只保存在平台后端，Provider Adapter 使用最小权限凭据；
- 每个 Deployment 使用独立容器、工作目录、网络和密钥；
- 默认只开放 443，Bot 不暴露公网端口；
- 上传项目包需要鉴权、大小限制和内容校验；
- 构建和运行设置 CPU、内存、磁盘、进程数和超时限制；
- 日志过滤 Token、密码和密钥；
- 停止和释放清理容器、临时文件、域名路由和密钥；
- 部署、重启、停止、释放和资源分配记录审计日志；
- 运行节点异常时从干净镜像隔离并重建。

## 16. 生命周期

    requested
        ↓
    provisioning
        ↓
    bootstrapping
        ↓
    deploying
        ↓
    ready / running  ← 开始计时
        ↓
    stopping
        ↓
    released         ← 结束计时并释放 VM

失败可从 provisioning、bootstrapping 或 deploying 进入。失败时平台先结束 Lease 并回收资源，再向 Studio 返回错误阶段和日志。

## 17. 后续扩展：共享 VM 与多项目部署

第一版按 Deployment 独占一个运行环境，但底层应允许多个 Deployment 共享整租 VM：

    整租 VM
    └── Docker
        ├── deployment-a container
        ├── deployment-b container
        └── deployment-c container

届时增加容器隔离、独立端口和域名路由、CPU/内存/磁盘/进程限制、多项目日志、Deployment 级启停、中央网关、恶意代码防护和资源配额。

Studio、部署 API 和计量服务不感知底层是“临时 VM + 一个容器”还是“整租 VM + 多个容器”。

## 18. MVP 验收标准

- Studio 可以一键创建 Deployment；
- 平台可以从至少一家供应商或自有资源池申请运行资源；
- VM 初始化和容器启动有明确进度与日志；
- 云端使用固定 Node 版本，并根据项目清单安装 @jeejio-bubble/bot 及其他依赖；
- 项目可重复部署和更新，失败时保留最近一次成功版本；
- 启动器可以加载标准运行时配置，并设置与本地 Studio 一致的 Bot 环境变量；
- 项目代码可以从环境变量读取 webapp_url 和 mps_id，并调用 Bot SDK；
- 项目定义的 Bot 交互可以通过稳定 HTTPS URL 打开 WebApp；
- 配置包含正确的 mps_id，Bot 部署后可以据此请求 PixelMug 下载设备端 MicroPython 代码；
- Bot 不需要公网域名即可运行；
- Deployment 停止后立即结束计时并释放 VM；
- 可以查询实时运行时长和最终用量记录；
- 可以查询 Lease 的接收、发送和公网方向流量累计值；
- VM、容器和 Lease 状态可自动对账并回收孤儿资源；
- 更换云服务商或改用整租 VM 资源池时，Studio 使用方式不变。

## 19. 推荐的第一版结论

Deployment 是资源和计费边界；Lease 按一次运行申请和计时；VM 可临时创建，也可来自整租资源池；VM 上使用 Docker 隔离每次部署；容器使用固定 Node LTS 并安装项目声明的 npm 依赖；平台生成包含 webapp_url 和 mps_id 的标准 Bot 运行时配置；启动器读取配置并设置与本地 Studio 一致的环境变量，项目代码通过环境变量调用 Bot SDK；停止或异常时立即结束计时并释放资源；Provider Adapter 屏蔽云服务商差异；第一版只做计量，未来再接入零售计费。

该方案保留三条演进路径：更换云服务商、整租 VM 后建立自己的资源池、以及在同一台 VM 上运行多个隔离 Deployment。

