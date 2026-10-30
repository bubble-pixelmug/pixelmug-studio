# 自购云主机部署教程

本文说明开发者购买自己的 Linux 云主机后，如何手动部署 Studio 项目。手动部署不使用 VM 池和 auto-deploy 服务，但项目使用同一套运行方式。

## 1. 准备条件

建议使用 Ubuntu 24.04 LTS，并准备：

- 一台有公网 IPv4 的云主机。
- 一个解析到该公网 IP 的域名，例如 `bot.example.com`。
- 云主机防火墙开放 TCP `80`、`443`；SSH 管理期间开放 TCP `22`。
- Docker 和 Docker Compose 插件。
- 项目根目录的 `package.json` 和 `package-lock.json`。

有 WebApp 时还需要 `webapp/package.json`、`webapp/package-lock.json`，并且 `npm run build` 能生成 `webapp/dist`。如果使用 Vite，必须配置 `base: './'`。

有 MPY 时需要 `mpy/__main__.py` 和合法的 `mpy/mps.json`。

## 2. 配置域名和防火墙

增加 A 记录：

```text
bot.example.com  A  <云主机公网 IPv4>
```

验证 DNS：

```bash
dig +short bot.example.com
```

应用容器的 `8799` 只绑定到本机，不需要对公网开放。公网只需要开放 `80` 和 `443`。

## 3. 安装 Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

重新登录 SSH 后检查：

```bash
docker version
```

## 4. 准备运行时 launcher

项目 Bot 只负责业务代码，不负责启动 WebApp 静态服务器。复制 Studio 提供的运行时入口：

```text
tools/studio/src/runtime/project-launcher.mjs
```

将它复制到项目根目录并命名为 `pixelmug-launcher.mjs`。launcher 会加载 `bot/index.js`，有 WebApp 时自动提供 `webapp/dist`，并在云端监听 `0.0.0.0:8799`。

项目 Bot 不需要实现 `startStaticServer`、`resolveWebAppRoot`、端口监听或 Caddy 配置。

## 5. Dockerfile

在项目根目录创建：

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN if [ -f webapp/package.json ]; then \
      npm --prefix webapp ci --include=dev --ignore-scripts; \
      if node -e "process.exit(require('./webapp/package.json').scripts?.build ? 0 : 1)"; then \
        npm --prefix webapp run build; \
        npm --prefix webapp prune --omit=dev --ignore-scripts; \
      fi; \
    fi
EXPOSE 8799
CMD ["node", "pixelmug-launcher.mjs"]
```

Bot 运行依赖放在根目录 `dependencies`。WebApp 构建依赖可以放在 WebApp 的 `devDependencies`。

## 6. 环境变量

```bash
cat > bot.env <<'EOF'
BOT_TOKEN=replace-with-your-bot-token
BOT_API_BASE_URL=https://us.jeejio.com/im
STUDIO_WEBAPP_URL=https://bot.example.com
WEBAPP_URL=https://bot.example.com
SERVE_WEBAPP=true
WEBAPP_PORT=8799
EOF
chmod 600 bot.env
```

变量说明：

| 变量 | 是否需要 | 说明 |
| --- | --- | --- |
| `BOT_TOKEN` | 必须 | Bot token |
| `BOT_API_BASE_URL` | 可选 | 默认 `https://us.jeejio.com/im` |
| `STUDIO_WEBAPP_URL` | 有 WebApp 时必须 | 用户打开的 HTTPS 地址 |
| `WEBAPP_URL` | 有 WebApp 时建议 | 通用 URL 别名 |
| `SERVE_WEBAPP` | 有 WebApp 时为 `true` | 启动静态服务 |
| `WEBAPP_PORT` | 可选 | 默认 `8799` |
| `STUDIO_MPS_ID` | 有 MPY 时必须 | MPS 应用 ID |
| `STUDIO_MPS_VERSION` | 有 MPY 时必须 | MPS 版本 |

没有 WebApp 时，不设置 `SERVE_WEBAPP=true` 和 URL 变量。没有 MPY 时，不需要 MPS 变量。

## 7. 构建和启动

```bash
docker build -t pixelmug/my-project:1.0.0 .
docker rm -f pixelmug-my-project 2>/dev/null || true
docker run -d \
  --name pixelmug-my-project \
  --restart unless-stopped \
  --env-file ./bot.env \
  -p 127.0.0.1:8799:8799 \
  pixelmug/my-project:1.0.0
```

检查：

```bash
docker ps
curl -I http://127.0.0.1:8799/
docker logs --tail 100 pixelmug-my-project
```

有 WebApp 时应看到：

```text
Studio runtime WebApp server listening on http://0.0.0.0:8799
WebApp URL: https://bot.example.com
```

## 8. Caddy 和 HTTPS

```bash
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https ca-certificates curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

创建 `/etc/caddy/Caddyfile`：

```caddyfile
bot.example.com {
    reverse_proxy 127.0.0.1:8799
}
```

验证并启动：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl -I https://bot.example.com
```

Caddy 会自动向 Let's Encrypt 申请免费证书并自动续期。域名必须已解析到服务器，TCP `80`、`443` 必须可从公网访问。

## 9. MPY 部署

自购服务器部署时，需要先将 `mpy/` 打包成 MPS 并上传到对应的 MPS 应用，再写入：

```text
STUDIO_MPS_ID=<MPS appId>
STUDIO_MPS_VERSION=<mps.json version>
```

`mpy/mps.json` 至少需要：

```json
{
  "name": "pixel_text",
  "version": "1.0.0",
  "dependencies": []
}
```

没有 MPY 时删除两个 MPS 变量，不要强制检查它们。

## 10. 更新、停止和排查

更新时重新构建镜像并替换容器：

```bash
docker build -t pixelmug/my-project:1.0.1 .
docker rm -f pixelmug-my-project
docker run -d --name pixelmug-my-project --restart unless-stopped \
  --env-file ./bot.env -p 127.0.0.1:8799:8799 pixelmug/my-project:1.0.1
```

停止容器：

```bash
docker stop pixelmug-my-project
```

页面打不开时依次检查：

```bash
docker ps
curl -I http://127.0.0.1:8799
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl status caddy
curl -I https://bot.example.com
```

常见原因是 launcher 没有启动、容器没有监听 `8799`、Caddy 域名写错、DNS 未生效，或云主机防火墙没有开放 `80/443`。

如果页面能打开但 JS/CSS 加载失败，确认 Vite 配置了 `base: './'`，并检查：

```bash
docker exec pixelmug-my-project find /app/webapp/dist -maxdepth 2 -type f
```

修改 `bot.env` 后必须重启容器；Bot 已发送的旧 WebApp 按钮不会自动更新，需要重新发送打开 WebApp 的命令。不要把 Bot token 写入 Dockerfile、Git 仓库或公开日志。
