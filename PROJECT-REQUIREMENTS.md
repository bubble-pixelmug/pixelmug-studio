# Studio 项目本地运行与云端部署要求

本文说明一个项目如何同时支持 Studio 本地运行和云端部署。

## 1. 项目目录结构

最小结构：

```text
my-project/
├─ package.json
├─ package-lock.json
├─ bot/
│  └─ index.js
```

包含 WebApp 时：

```text
my-project/
├─ package.json
├─ package-lock.json
├─ bot/
│  └─ index.js
└─ webapp/
   ├─ package.json
   ├─ package-lock.json
   ├─ index.html
   ├─ src/
   └─ vite.config.js
```

包含 MPY 时：

```text
my-project/
└─ mpy/
   ├─ __main__.py
   ├─ mps.json
   └─ 其他 Python 文件
```

Studio 会检查：

- 必须有 `bot/`。
- Bot 入口必须位于 `bot/` 内，例如 `bot/index.js`。
- 有 `webapp/` 时，必须包含有效的 `package.json`。
- 有 `mpy/` 时，必须包含 `mpy/__main__.py` 和 `mpy/mps.json`。

## 2. 根目录 package.json

根目录代表 Bot 运行环境，必须明确声明 SDK：

```json
{
  "name": "my-project",
  "private": true,
  "type": "module",
  "dependencies": {
    "@jeejio-bubble/bot": "0.1.9"
  }
}
```

要求：

- `@jeejio-bubble/bot` 必须显式声明。
- Bot 运行所需的包放在 `dependencies`。 
- `package-lock.json` 必须存在并且与 `package.json` 同步。

Studio 本地启动时，如果没有 lock 文件，会自动执行 `npm install`，然后执行 `npm ci`。云端部署使用生成后的 lock 文件执行 `npm ci`。

## 3. Bot 编码要求

Bot 必须从环境变量读取运行配置：

```js
import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});
```

不要在代码中写死 Bot token、API 地址、本地 Studio 地址或云端域名。

打开 WebApp 时使用注入的 URL：

```js
const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error('WebApp URL is not configured');
```

如果 Bot 需要调用设备，还必须注册对应设备类型，并保证 `talId` 与设备匹配。WebApp 应通过 SDK 的 `getDevices()` 获取设备，不要自行拼接设备 ID。

## 4. WebApp 编码要求

WebApp 的 `package.json` 必须声明 SDK：

```json
{
  "name": "my-webapp",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "@jeejio-bubble/bot": "0.1.9"
  },
  "devDependencies": {
    "vite": "6.4.3"
  }
}
```

使用设备 SDK：

```js
import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';

const webapp = new BubbleWebApp();;
const devices = await webapp.getDevices();
await webapp.callDevice(devices[0], rpcCommand);
```

要求：

- 必须有 `build` script。
- 构建结果必须输出到 `dist` 或 `build`。
- 使用其他输出目录时，配置 `pixelmug.outputDir`。
- 必须有 `webapp/package-lock.json`。
- 构建依赖必须写在 WebApp 的 `package.json` 中。
- 不要依赖全局安装的构建工具。

### Vite 项目必须使用相对资源路径

Studio 通过 `/app/<project-key>/` 提供本地 WebApp，Vite 项目需要配置：

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
});
```

这样构建结果使用 `./assets/index.js` 和 `./assets/index.css`，可以在 Studio gateway 的子路径下正常加载。React、Vue、原生 HTML 或其他框架均可使用，只要能够构建并使用正确的资源路径。

## 5. WebApp 运行时要求

云端容器通过 Caddy 转发：

```text
HTTPS 域名 → 127.0.0.1:8799
```

静态 WebApp 服务由 Studio/云端运行时自动启动。项目 Bot 不需要实现启动服务、解析路径、端口监听或 Caddy 配置。

运行时会根据项目是否包含 WebApp 自动决定是否启动服务：

- Studio 本地运行时由 Studio gateway 提供页面，Bot 进程不监听 WebApp 端口。
- 云端运行时由注入的 launcher 提供静态服务。
- 云端静态服务监听 `0.0.0.0:8799`，提供构建后的 `webapp/dist`。
- Caddy 由部署服务配置，不属于项目代码。

项目 Bot 只负责业务逻辑和发送 WebApp URL，不负责启动 WebApp HTTP 服务。

## 6. MPY 要求

包含 `mpy/` 时必须有：

```text
mpy/__main__.py
mpy/mps.json
```

`mps.json` 至少包含：

```json
{
  "name": "pixel_text",
  "version": "1.0.0"
}
```

限制：

- `name` 只能使用小写字母、数字、`.`、`_`、`-`。
- `version` 必须是 SemVer，例如 `1.0.0`。
- `name` 最长 64 个字符。
- `version` 最长 32 个字符。

Studio 本地运行时使用 `mps.json` 的 name 和 version，并通过 WebREPL 将本地 MPY 代码复制到设备。云端部署时将 `mpy/` 打包成 `.mps`，使用用户选择的 MPS ID 和 token 上传。

没有 `mpy/` 时：

- 不需要 MPS ID。
- 不需要 MPS token。
- 不需要打包或上传 `.mps`。
- 不会阻止部署。

## 7. Studio 本地环境变量

Studio 会注入：

```text
BOT_TOKEN
BOT_API_BASE_URL
STUDIO_WEBAPP_URL
STUDIO_MPS_ID
STUDIO_MPS_VERSION
```

典型值：

```text
BOT_TOKEN=用户选择的 Bot token
BOT_API_BASE_URL=https://us.jeejio.com/im
STUDIO_WEBAPP_URL=http://pixelmug-studio.local:7979/app/...
STUDIO_MPS_ID=local-debug
STUDIO_MPS_VERSION=1.0.0
```

没有 WebApp 时，`STUDIO_WEBAPP_URL` 为空；没有 MPY 时，`STUDIO_MPS_ID` 和 `STUDIO_MPS_VERSION` 为空。

## 8. 云端环境变量

部署服务会注入：

```text
BOT_TOKEN
BOT_API_BASE_URL
STUDIO_WEBAPP_HOST
STUDIO_WEBAPP_URL
WEBAPP_URL
SERVE_WEBAPP=true
STUDIO_MPS_ID
STUDIO_MPS_VERSION
```

典型值：

```text
BOT_API_BASE_URL=https://us.jeejio.com/im
STUDIO_WEBAPP_HOST=dep-xxxx.lh-01.deploy.jeejio.com
STUDIO_WEBAPP_URL=https://dep-xxxx.lh-01.deploy.jeejio.com
WEBAPP_URL=https://dep-xxxx.lh-01.deploy.jeejio.com
SERVE_WEBAPP=true
```

没有 MPY 的项目中，`STUDIO_MPS_ID` 和 `STUDIO_MPS_VERSION` 为空。

## 9. 云端构建流程

云端 Docker 构建执行：

```text
npm ci --omit=dev
npm --prefix webapp ci --include=dev
npm --prefix webapp run build
npm --prefix webapp prune --omit=dev
node bot/index.js
```

因此：

- 根目录依赖必须支持生产环境安装。
- Bot 运行依赖必须放在根目录 `dependencies`。
- WebApp 构建依赖可以放在 WebApp 的 `devDependencies`。
- 根目录和 WebApp 都必须有同步的 lock 文件。
- 不要提交或依赖本机的 `node_modules`。
- 不要依赖本机预装组件。

## 10. 部署成功检查

带 WebApp 的项目必须同时满足：

- Bot 容器正常启动。
- Bot 能读取 `BOT_TOKEN`。
- Bot 能读取 `STUDIO_WEBAPP_URL` 或 `WEBAPP_URL`。
- WebApp 静态服务器监听 `0.0.0.0:8799`。
- 容器内访问 `http://127.0.0.1:8799` 能返回页面。
- Caddy 能反向代理到 `127.0.0.1:8799`。
- 域名 DNS 指向 VM。
- HTTPS 证书申请成功。
- WebApp 的 JS 和 CSS 使用相对资源路径。
- Bot 发送的 WebApp 按钮使用云端域名。
- 包含 MPY 时，MPS 打包和上传成功。

最常见的失败原因：

1. 没有 `package-lock.json`。
2. `@jeejio-bubble/bot` 没有写进 `package.json`。
3. WebApp 没有 `build` script。
4. Vite 资源使用 `/assets/...` 而不是 `./assets/...`。
5. 项目运行时没有正确生成 WebApp 构建输出。
6. Bot 读取了错误的 URL 环境变量。
7. 部署服务或旧容器没有重启，仍在运行旧代码。
8. 项目包含 MPY，但没有配置 MPS ID。
9. 项目不包含 MPY，却错误地强制检查 MPS ID。
