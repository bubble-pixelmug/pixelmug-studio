# MicroPyxel Tone API 示例：比较自定义波表、采样位数和两种噪声音色。
# 展示 API：tones()、get_mode()/set_mode()、get_sample_bits()/set_sample_bits()、
# get_gain()/set_gain()、get_wavetable()、len()、to_list() 和 from_list()。
# 波表与噪声是两个测试阶段，阶段之间静音 2 秒。

import time

import audio_service
import micropyxel as upyxel


FPS = 10
STEP_MS = 5000
PHASE_GAP_MS = 2000

MODE_WAVETABLE = 0
MODE_SHORT_NOISE = 1
MODE_LONG_NOISE = 2

SAW_WAVETABLE = (0, 2, 4, 6, 8, 10, 12, 15)
STEP_WAVETABLE = (0, 1, 2, 3, 3, 2, 1, 0)


def main():
    audio = audio_service.audio
    audio_inited = False
    upyxel_inited = False
    channel = None
    tone = None

    original_mode = None
    original_bits = None
    original_gain = None
    original_wavetable = None

    title = "TONE"
    value_text = "READY"

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

        # 这段旋律中的 "t" 使用全局 Tone 0。
        upyxel.sounds(0).set(
            "c2e2g2c3",
            "t",
            "7",
            "n",
            20,
        )

        channel = upyxel.channels(0)
        tone = upyxel.tones(0)
        wavetable = tone.get_wavetable()

        original_mode = tone.get_mode()
        original_bits = tone.get_sample_bits()
        original_gain = tone.get_gain()
        original_wavetable = wavetable.to_list()

        def print_tone(label):
            table = tone.get_wavetable()
            print(
                label,
                "mode =",
                tone.get_mode(),
                "bits =",
                tone.get_sample_bits(),
                "gain =",
                tone.get_gain(),
                "wavetable length =",
                len(table),
                "wavetable =",
                table.to_list(),
            )

        def restart_sound():
            channel.stop()
            channel.play(0, should_loop=True)

        def play_default():
            nonlocal title, value_text
            tone.set_mode(original_mode)
            tone.set_sample_bits(original_bits)
            tone.set_gain(original_gain)
            tone.get_wavetable().from_list(original_wavetable)
            restart_sound()
            title = "WAVE 4B"
            value_text = "DEFAULT"
            print_tone("默认波表：")

        def play_saw():
            nonlocal title, value_text
            tone.set_mode(MODE_WAVETABLE)
            tone.set_sample_bits(4)
            tone.set_gain(0.8)
            tone.get_wavetable().from_list(SAW_WAVETABLE)
            restart_sound()
            title = "WAVE 4B"
            value_text = "SAW"
            print_tone("4-bit 锯齿波：")

        def play_step():
            nonlocal title, value_text
            tone.set_mode(MODE_WAVETABLE)
            tone.set_sample_bits(2)
            tone.set_gain(0.8)
            tone.get_wavetable().from_list(STEP_WAVETABLE)
            restart_sound()
            title = "WAVE 2B"
            value_text = "STEP"
            print_tone("2-bit 阶梯波：")

        def play_noise(mode, label):
            nonlocal title, value_text
            tone.set_mode(mode)
            tone.set_gain(0.6)
            restart_sound()
            title = "NOISE"
            value_text = label
            print_tone(label + " 噪声：")

        test_started = None
        step = 0

        def update(rt):
            nonlocal test_started, step, title, value_text

            now = time.ticks_ms()

            if test_started is None:
                test_started = now
                play_default()
                return

            elapsed = time.ticks_diff(now, test_started)

            if step == 0 and elapsed >= STEP_MS:
                test_started = now
                step = 1
                play_saw()
            elif step == 1 and elapsed >= STEP_MS:
                test_started = now
                step = 2
                play_step()
            elif step == 2 and elapsed >= STEP_MS:
                channel.stop()
                test_started = now
                step = 3
                title = "NOISE"
                value_text = "NEXT"
                print("波表测试结束，静音 2 秒")
            elif step == 3 and elapsed >= PHASE_GAP_MS:
                test_started = now
                step = 4
                play_noise(MODE_SHORT_NOISE, "SHORT")
            elif step == 4 and elapsed >= STEP_MS:
                test_started = now
                step = 5
                play_noise(MODE_LONG_NOISE, "LONG")
            elif step == 5 and elapsed >= STEP_MS:
                channel.stop()
                title = "NOISE"
                value_text = "STOP"
                rt.quit()

        def draw(rt):
            rt.cls(1)
            color = 10 if channel.play_pos() is not None else 13
            rt.text(0, 0, title, color)
            rt.text(0, 8, value_text, color)

        print("MicroPyxel Tone API 演示开始")
        upyxel.run(update, draw, fps=FPS)
        print("MicroPyxel Tone API 演示结束")
    finally:
        if channel is not None:
            try:
                channel.stop()
            except Exception:
                pass

        if tone is not None and original_mode is not None:
            try:
                tone.set_mode(original_mode)
                tone.set_sample_bits(original_bits)
                tone.set_gain(original_gain)
                tone.get_wavetable().from_list(original_wavetable)
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
