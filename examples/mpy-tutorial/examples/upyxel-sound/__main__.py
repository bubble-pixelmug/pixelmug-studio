# MicroPyxel Sound API 示例：依次演示声音资源、播放位置和通道控制。
# 展示 API：sounds().set()、total_sec()、play()、play_pos()、stop()。
# play() 参数覆盖 sec、should_loop 和 should_resume。
# 屏幕顶部显示 channels，下一行显示 0～3；黄色表示正在播放，灰色表示停止。

import time

import audio_service
import micropyxel as upyxel


FPS = 10
PHASE_GAP_MS = 2000
RESUME_EFFECT_DELAY_MS = 2500

# (显示名称, 持续时间 ms)
PHASES = (
    ("通道单独播放、合奏与依次停止", 29000),
    ("Sound 0 从第 2 秒开始播放", 4000),
    ("C0 背景旋律中插入短提示音", 10000),
)


def setup_sounds():
    upyxel.sounds(0).set(
        "e2e2c2g1 g1g1c2e2 d2d2d2g2 g2g2rr c2c2a1e1 e1e1a1c2 b1b1b1e2 e2e2rr",
        "p",
        "6",
        "vffn fnff vffs vfnn",
        25,
    )
    upyxel.sounds(1).set(
        "r a1b1c2 b1b1c2d2 g2g2g2g2 c2c2d2e2 f2f2f2e2 f2e2d2c2 d2d2d2d2 g2g2r r",
        "s",
        "6",
        "nnff vfff vvvv vfff svff vfff vvvv svnn",
        25,
    )
    upyxel.sounds(2).set(
        "c1g1c1g1 c1g1c1g1 b0g1b0g1 b0g1b0g1 a0e1a0e1 a0e1a0e1 g0d1g0d1 g0d1g0d1",
        "t",
        "7",
        "n",
        25,
    )
    upyxel.sounds(3).set(
        "f0c1f0c1 g0d1g0d1 c1g1c1g1 a0e1a0e1 f0c1f0c1 f0c1f0c1 g0d1g0d1 g0d1g0d1",
        "t",
        "7",
        "n",
        25,
    )
    upyxel.sounds(4).set(
        "f0ra4r f0ra4r f0ra4r f0f0a4r",
        "n",
        "6622 6622 6622 6422",
        "f",
        25,
    )

    # 独立的短提示音：高低音快速切换，便于听出临时音效和背景旋律。
    upyxel.sounds(5).set(
        "c4g3c4",
        "p",
        "7",
        "f",
        20,
    )

    print(
        "Sound 0～5 预计时长（秒）：",
        [upyxel.sounds(i).total_sec() for i in range(6)],
    )


def play_three_channels():
    upyxel.play(0, [0, 1], should_loop=True)
    upyxel.play(1, [2, 3], should_loop=True)
    upyxel.play(2, 4, should_loop=True)


def start_phase(phase_index):
    name, _ = PHASES[phase_index]
    upyxel.stop()

    if phase_index == 0:
        upyxel.play(0, [0, 1], should_loop=True)
    elif phase_index == 1:
        upyxel.play(0, 0, sec=2.0)
    elif phase_index == 2:
        upyxel.play(0, [0, 1], should_loop=True)

    print("当前模式：", name)

def main():
    audio = audio_service.audio
    audio_inited = False
    upyxel_inited = False

    try:
        print("MicroPyxel Sound API 演示开始")
        audio.init(
            enable_input=False,
            enable_output=True,
            with_opus_encoder=False,
            with_opus_decoder=False,
        )
        audio_inited = True
        audio.configure(output_volume=100)

        upyxel.init(start_audio=True)
        upyxel_inited = True
        setup_sounds()

        phase_index = 0
        phase_started = None
        gap_until = None
        effect_at = None
        phase_action = 0

        def update(rt):
            nonlocal phase_index, phase_started, effect_at, gap_until
            nonlocal phase_action

            now = time.ticks_ms()

            # 首次播放和对应日志在同一次 update() 中发生。
            if phase_started is None:
                phase_started = now
                start_phase(phase_index)
                print("通道演示：C0 单独播放")
                return

            # 阶段之间保持两秒静音，再启动下一项测试。
            if gap_until is not None:
                if time.ticks_diff(now, gap_until) < 0:
                    return

                phase_index += 1
                phase_started = now
                gap_until = None
                effect_at = None
                phase_action = 0
                start_phase(phase_index)

                if phase_index == 2:
                    effect_at = time.ticks_add(
                        phase_started, RESUME_EFFECT_DELAY_MS
                    )                    
                return

            elapsed = time.ticks_diff(now, phase_started)


            # 到达独立的触发时间后，才使用提示音暂时替换 C0 的背景旋律。
            if (
                phase_index == 2
                and phase_action == 0
                and effect_at is not None
                and time.ticks_diff(now, effect_at) >= 0
            ):
                print("背景旋律已播放", elapsed, "ms，插入短提示音 Sound 5")
                upyxel.play(0, 5, should_resume=True)                
                phase_action = 1

            # 一个阶段内连续试听三个通道、合奏，再逐个停止。
            if phase_index == 0:
                if phase_action == 0 and elapsed >= 6000:
                    upyxel.stop()
                    upyxel.play(1, [2, 3], should_loop=True)
                    print("通道演示：C1 单独播放")
                    phase_action = 1
                elif phase_action == 1 and elapsed >= 12000:
                    upyxel.stop()
                    upyxel.play(2, 4, should_loop=True)
                    print("通道演示：C2 单独播放")
                    phase_action = 2
                elif phase_action == 2 and elapsed >= 18000:
                    upyxel.stop()
                    play_three_channels()
                    print("通道演示：C0、C1、C2 一起播放")
                    phase_action = 3
                elif phase_action == 3 and elapsed >= 24000:
                    upyxel.stop(0)
                    print("停止 C0")
                    phase_action = 4
                elif phase_action == 4 and elapsed >= 26000:
                    upyxel.stop(1)
                    print("停止 C1")
                    phase_action = 5
                elif phase_action == 5 and elapsed >= 28000:
                    upyxel.stop(2)
                    print("停止 C2")
                    phase_action = 6
            if elapsed < PHASES[phase_index][1]:
                return

            if phase_index + 1 >= len(PHASES):
                rt.quit()
                return

            upyxel.stop()
            gap_until = time.ticks_add(now, PHASE_GAP_MS)            
        def draw(rt):
            rt.cls(1)
            rt.text(0, 0, "channels", 7)
            for channel in range(4):
                color = 10 if rt.play_pos(channel) is not None else 13
                rt.text(2 + channel * 8, 8, str(channel), color)

        
        upyxel.run(update, draw, fps=FPS)
        print("MicroPyxel Sound API 演示结束")
    finally:
        if upyxel_inited:
            try:
                upyxel.stop()
            except Exception:
                pass
            try:
                upyxel.destroy()
            except Exception:
                pass
        if audio_inited:
            try:
                audio.deinit()
            except Exception:
                pass


main()
