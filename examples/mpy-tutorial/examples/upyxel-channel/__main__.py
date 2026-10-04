# MicroPyxel Channel API 示例：比较通道增益和音高微调。
# 展示 API：channels()、gain()、set_gain()、detune()、set_detune()、
# Channel.play()、Channel.play_pos() 和 Channel.stop()。
# Gain 和 Detune 是两个测试阶段，阶段之间静音 2 秒。

import time

import audio_service
import micropyxel as upyxel


FPS = 10
STEP_MS = 5000
PHASE_GAP_MS = 2000

GAIN_VALUES = (0.0625, 0.125, 0.25)
DETUNE_VALUES = (0, 100, -100)


def main():
    audio = audio_service.audio
    audio_inited = False
    upyxel_inited = False
    channel = None

    mode = "ready"
    value_text = ""

    try:
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

        upyxel.sounds(0).set(
            "c2e2g2c3",
            "p",
            "7",
            "n",
            20,
        )

        # channels(0) 返回参与 MicroPyxel 实际混音的全局通道。
        channel = upyxel.channels(0)
        print(
            "Channel 0 默认值：gain =",
            channel.gain(),
            "detune =",
            channel.detune(),
            "cents",
        )

        test_started = None
        step_index = 0

        def play_gain(value):
            nonlocal mode, value_text
            channel.set_detune(0)
            channel.set_gain(value)
            channel.play(0, should_loop=True)
            mode = "gain"
            value_text = str(value)
            print("Channel 0 gain：", channel.gain())

        def play_detune(value):
            nonlocal mode, value_text
            channel.set_gain(0.125)
            channel.set_detune(value)
            channel.play(0, should_loop=True)
            mode = "detune"
            value_text = "{:+d}".format(value)
            print("Channel 0 detune：", channel.detune(), "cents")

        def update(rt):
            nonlocal test_started, step_index, mode, value_text

            now = time.ticks_ms()

            if test_started is None:
                test_started = now
                step_index = 0
                play_gain(GAIN_VALUES[step_index])
                return

            elapsed = time.ticks_diff(now, test_started)

            if mode == "gain" and elapsed >= STEP_MS:
                step_index += 1
                if step_index < len(GAIN_VALUES):
                    test_started = now
                    play_gain(GAIN_VALUES[step_index])
                else:
                    channel.stop()
                    test_started = now
                    step_index = 0
                    mode = "gap"
                    value_text = "NEXT"
                    print("Gain 测试结束，静音 2 秒")
                return

            if mode == "gap" and elapsed >= PHASE_GAP_MS:
                test_started = now
                play_detune(DETUNE_VALUES[step_index])
                return

            if mode == "detune" and elapsed >= STEP_MS:
                step_index += 1
                if step_index < len(DETUNE_VALUES):
                    test_started = now
                    play_detune(DETUNE_VALUES[step_index])
                else:
                    channel.stop()
                    mode = "done"
                    value_text = "STOP"
                    rt.quit()

        def draw(rt):
            rt.cls(1)
            if mode == "gain":
                title = "CH0 GAIN"
            else:
                title = "CH0 TUNE"

            color = 10 if channel.play_pos() is not None else 13
            rt.text(0, 0, title, color)
            rt.text(0, 8, value_text, color)

        print("MicroPyxel Channel API 演示开始")
        upyxel.run(update, draw, fps=FPS)
        print("MicroPyxel Channel API 演示结束")
    finally:
        if channel is not None:
            try:
                channel.stop()
                channel.set_gain(0.125)
                channel.set_detune(0)
            except Exception:
                pass
        if upyxel_inited:
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
