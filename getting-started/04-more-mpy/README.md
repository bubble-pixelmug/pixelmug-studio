# 04 · 体验更多 MPY 应用

本项目使用同一个 Bot，在 PixelMug S1 Pro / Lite 上运行不同的独立 MPY 示例。不支持 P1，不需要 WebApp，也不需要为示例填写账号或 API Key。

## 目录

```text
04-more-mpy/
├─ bot/index.js       帮助、关联设备、手动安装 MPY
├─ exampleMPY/       独立 MPY 示例集合
│  ├─ bitCoin/        BTC/USD 行情示例源文件
│  │  ├─ __main__.py
│  │  └─ mps.json
│  ├─ rotateImage/    PNG 旋转示例，包含 asset.png
│  ├─ musicPlayer/    本地音乐播放与默认频谱，包含 test_audio.ogg
│  └─ motion/         G-sensor 驱动白色粒子柱倾倒和弹跳
├─ mpy/               当前要运行的示例，默认已复制 bitCoin 的内容
└─ package.json
```

后续可以在 `exampleMPY/` 中继续增加 `player/` 等独立示例，每个示例都提供自己的 `__main__.py`、`mps.json` 和所需资源。Studio 实际加载的是 `mpy/`，不会同时运行示例集合中的所有程序。

## 在 Studio 中运行

1. 打开整个 `getting-started/04-more-mpy` 文件夹，选择 `bot/index.js`，填写 Bot token。
2. **关闭“启动后自动运行设备代码”**，本例通过 Bot 命令手动发起安装。
3. 启动智能体。在冒泡 App 私聊 Bot，发送 `/help` 查看说明，用 `/bindPixelMug` 关联一台在线的 S1。
4. 发送 `/installMPY`。Bot 发起 `talMpyExecOneScript`，Studio 接管并加载当前 `mpy/`。
5. 在 Studio 的设备调试页查看进度。Bot 回复“已受理”不代表设备已经安装完成；收到设备的 `MPS_IS_RUNNING` 上报后，Bot 才会回复“MPY 已在 PixelMug 上运行”。如果设备返回已经运行，则直接提示可开始体验。安装失败、启动阶段的运行错误或等待上报超过两分钟，也会在聊天中提示。

本例使用空的 MPS `id` 和 `version`，供 Studio 本地分流使用；不是用于正式发布的线上脚本标识。

## 第一个示例：bitCoin

默认 `mpy/` 已放入 `exampleMPY/bitCoin/` 的全部代码，首次体验无需复制。程序在水杯上直接连接 Kraken 的公开 WebSocket 行情源，订阅 BTC/USD 最新成交价并显示：

- `CONNECT`：正在建立连接。
- `WAIT`：已发送订阅，等待价格。
- 绿色数字：收到的 BTC/USD 价格，以美元计价。

设备需连接可访问该服务的 Wi-Fi，系统时间正确，并且固件包含 `micropyxel` 和 `mps_websocket`。程序沿用组件默认的 TLS 证书校验，不需要密钥或代理配置。它只读取并显示行情，不进行交易。

为便于阅读，本例不包含自动重连。网络中断、连接超时或订阅失败时，程序结束并在设备日志中记录原因；恢复网络后再次发送 `/installMPY`。

代码参考 `mps/mpy-examples/websocket/btc.py`，保留连接、订阅、读取价格和绘图的主流程。价格尽量显示两位小数；超过屏幕宽度时改为整数。

默认直接连接。如果需要 HTTP 代理，将 `__main__.py` 最后一行改为：

```python
asyncio.run(main(proxy="http://192.168.0.106:7890"))
```

替换为水杯可访问的代理地址和端口，代理需允许局域网连接。省略参数或传入 `None` 时不使用代理。

## 更换或修改示例

### rotateImage：旋转 PNG 图块

将 `exampleMPY/rotateImage/` 中的 `__main__.py`、`mps.json`、`asset.png` 一起复制到 `mpy/`，按下面步骤通过 `/installMPY` 运行。

素材为 32×16 PNG：右半边的 16×16 图块重复铺成背景，左半边的 16×16 图块在屏幕中央每 100 毫秒顺时针旋转 15°。无需 WebApp 或网络行情服务。

当前固件的 PNG 接口名为 `pyxel.images(0).load_from_png(0, 0, "asset.png", True)`，最后的 `True` 启用图片颜色加载（仅支持位置参数）。旋转使用 `blt(..., None, angle, None)`，不设置透明色、不缩放。可以修改 `ROTATE_INTERVAL_MS` 调整速度，或修改 `TILE_X`、`TILE_Y` 调整位置。

### 切换步骤

下面的切换步骤同样适用于 musicPlayer。

1. 停止智能体。
2. 清空项目 `mpy/` 中旧示例的内容。
3. 将所选示例文件夹内的**全部文件及子目录**复制到 `mpy/`。入口应为 `mpy/__main__.py`，不要复制成 `mpy/bitCoin/__main__.py`。
4. 启动智能体，再发送 `/installMPY`。

保留 `exampleMPY/` 中的示例文件夹作为原始代码；实际体验时可以编辑 `mpy/` 中的副本。更换示例时一并替换 `mps.json` 和资源，避免混用旧文件。

## musicPlayer：点击播放本地音乐

该示例与 motion 一样，按上面的切换步骤复制全部文件后运行。

将 `exampleMPY/musicPlayer/` 内全部文件复制到 `mpy/`，包括 `__main__.py`、`ogg.py`、`spectrum.py`、`mps.json` 和 `test_audio.ogg`，再通过 `/installMPY` 运行。

屏幕滚动显示 `Click to Start`，单击水杯后播放本地音乐，并显示彩色柱形频谱与白色峰值线。音乐真正播放完毕后，滚动显示 `Click to Restart`；再次单击从头播放，可反复体验。播放中的点击不会触发下一次播放。

本例仅保留 `audio-visualizer` 的默认频谱，不需要网络、WebApp 或 BLE。固件需提供 `audio_service`、`micropyxel` 和 `mpy_button`。素材须为 Ogg Opus（不是 Ogg Vorbis），支持单声道或双声道、20/40/60 毫秒 Opus 帧。可以在 `__main__.py` 调整 `VOLUME`。

`ogg.py` 从本地文件拆出 Opus 音频包，Audio Service 负责解码和播放，`spectrum.py` 从输出音频获取 16 段频谱。文件或播放异常会记录到设备日志，并回到点击重试提示。

## motion：摇动水杯，让粒子柱倒塌

将 `exampleMPY/motion/` 的 `__main__.py` 和 `mps.json` 复制到 `mpy/`，通过 `/installMPY` 运行。屏幕底部中央排列 32 个纯白色的单像素小球，形成宽 4、高 8 的柱子。倾斜或摇动水杯，小球随重力和加速度倾倒、散开，并在屏幕边界反弹；屏幕内没有障碍物。

单击水杯底部触摸按键可重新开始：所有粒子恢复为底部居中的 4×8 白色柱子，速度清零，屏幕不显示提示。

本例参考 `mps/mpy-examples/maze/maze.py`，使用 `g_sensor` 的 X/Z 轴加速度驱动 `PixelDust`，由 MicroPyxel 绘制，`mpy_button` 处理单击重置。无需网络、WebApp 或 BLE。可以修改 `ACCEL_SCALE` 调整响应力度，修改 `ELASTICITY` 调整反弹强度。
