# MPY 文档配套示例

在 Studio 中打开本目录，配置 Bot 并关联 PixelMug S1。`bot/` 提供 `/help`、`/bindPixelMug` 和 `/installMPY`，`mpy/` 是实际安装到设备的程序，`examples/` 存放各个独立示例。

切换时先停止设备程序，清空 `mpy/` 中上一个示例的文件，再将 `examples/<示例目录>/` 内的全部文件复制到 `mpy/`。勾选“启动后自动运行设备代码”后启动智能体，或在智能体运行时发送 `/installMPY` 手动安装。保留需要的本地文件后再清空目录。

| 示例 | 内容 |
| --- | --- |
| `audio-pcm-tone` | 生成并播放半秒 PCM 提示音 |
| `audio-pcm-record` | 录制约三秒 PCM 到设备文件 |
| `audio-opus-record` | 事件型录制约三秒 Opus，再逐包流式回放 |
| `audio-ogg-player` | 播放本地 Ogg Opus 文件，附拆包器和素材 |
| `audio-wav-player` | 分块读取本地 audio.wav，流式播放 PCM |
| `audio-playback-control` | 播放两段声音，演示正常结束、替换、主动停止及 play_end 事件 |
| `audio-input-spectrum` | 显示十秒麦克风频谱 |
| `audio-output-spectrum` | 16 个频段各播放 1 秒 PCM，显示从左到右的输出频谱 |
| `audio-vad` | 持续监听 VAD，打印说话和停止说话状态 |
| `g-sensor-axis-calibration` | 通过上下、前后、左右平移标定 G-sensor 三轴与水杯坐标系 |
| `motion-show-axis` | 通过实心圆的位置和大小感受水杯左右、上下、前后的运动交互 |
| `motion-tilt-level` | 使用加速度的重力投影显示倾斜水平仪 |
| `motion-gyro` | 用三条速度条显示 X、Y、Z 三轴角速度 |
| `motion-attitude-horizon` | 使用 pitch 和 roll 显示姿态地平线 |
| `motion-event-monitor` | 轮询、打印并显示全部 G-sensor 运动事件 |
| `motion-tap-counter` | 通过 EVENT_TAP 回调统计杯身敲击并播放动画 |
| `upyxel-animation` | MicroPyxel 小球碰边反弹，展示 update / draw 自动动画循环 |
| `upyxel-draw-state` | 分段展示 clip 裁剪窗口和 camera 相机跟随 |
| `upyxel-events` | 单击触摸按键暂停或恢复计数，展示 on / emit / state / off |
| `upyxel-sprite-animation` | VAD 检测到说话时播放三帧小鸟扇翅动画，安静时停在当前帧 |
| `upyxel-manual-render` | 像素点从左向右移动，展示手动刷新和帧间隔控制 |
| `upyxel-shapes` | 分页展示点、线、矩形、圆、椭圆、三角形和区域填充 |
| `upyxel-text` | 使用内置字体显示静态文字和横向滚动文字 |
| `upyxel-font` | 加载 BDF 字体，测试文字测宽、居中和长文字滚动 |

| `network-udp-cast` | 上位机生成九种 32×16 动画，通过 UDP 投屏到 PixelMug；进入 `host-effect-caster` 后运行 `npm start` |

每个示例的用途、API 和限制写在源码顶部，没有单独的 README。项目现有 `mpy/` 内容保留，可按上述方式替换。



