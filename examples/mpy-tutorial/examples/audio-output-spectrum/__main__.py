# Audio Service + MicroPyxel 完整用例：16 个频段的测试音依次播放，显示真实输出频谱。
# 这里的“16 个频道”是频谱的 16 个频段；PCM 仍是 48 kHz、单声道、16 位小端。
# 每个频段播放 1 秒，共 16 秒，从低频到高频；不是根据播放序号模拟柱状图。
# 展示 API：Player.open_stream/write/end，enable_dump_output(True)、enable_on_pcm(2)，
# 以及 get_bands_u8_into 和 MicroPyxel 绘图。
# 采用 4096 点 FFT（48 kHz 下分辨率约 11.72 Hz），使最左侧低频段也有频点。
# 有限 FFT 窗口会使相邻柱子偶尔出现；换音时约 85 ms 的窗口中也可能包含两个音。
# 先生成每个音的 100 ms PCM，再重复十次；播放时不再计算正弦波。
# 频率均为 10 Hz 的整数倍，100 ms 包含整数周期，重复时相位连续。
# 16 份 PCM 共约 154 KB；每次提交 20 ms，绘图期间继续供给音频。
# MicroPyxel 只绘图，不开启声音合成；不需要录音或素材文件。

import math
import struct
import time
import audio_service
import micropyxel as pyxel


FREQUENCIES = (60, 90, 120, 170, 230, 320, 450, 600,
               830, 1160, 1610, 2240, 3100, 4300, 5900, 7400)


def make_tones():
    tones = []
    for frequency in FREQUENCIES:
        pcm = bytearray(4800 * 2)  # 100 ms。
        for i in range(4800):
            sample = int(6000 * math.sin(2 * math.pi * frequency * i / 48000))
            struct.pack_into("<h", pcm, i * 2, sample)
            if i % 480 == 0:
                time.sleep_ms(1)
        view = memoryview(pcm)
        # memoryview 引用原缓冲，不复制音频；每块 960 样本，即 20 ms。
        tones.append([view[i:i + 1920] for i in range(0, len(pcm), 1920)])
    return tones


def main():
    print("正在生成 16 个频段的测试音，请稍候……")
    tones = make_tones()
    audio = audio_service.audio
    analyzer = None
    session = None
    heights = bytearray(16)
    last_draw = time.ticks_ms()

    def refresh():
        nonlocal last_draw
        audio.poll()
        now = time.ticks_ms()
        if time.ticks_diff(now, last_draw) >= 40:
            pyxel.cls(0)
            if analyzer.get_bands_u8_into(heights, 16) == 16:
                for band, height in enumerate(heights):
                    if height:
                        pyxel.rect(band * 2, 16 - height, 1, height, 11)
            pyxel.render_graphics()
            last_draw = now

    audio.init(enable_input=False, enable_output=True,
               with_opus_encoder=False, with_opus_decoder=False)
    try:
        audio.configure(output_volume=100)
        analyzer = audio.spectrum_analyzer(
            fft_size=4096, sample_rate=48000, pcm_ringbuf_cap=8192
        )
        analyzer.set_fps(25)
        analyzer.enable_dump_output(True)
        analyzer.enable_on_pcm(2)
        pyxel.init(start_audio=False)
        try:
            pyxel.cls(0)
            pyxel.render_graphics()
            player = audio.player("pcm", sample_rate=48000, frame_ms=20)
            session = player.open_stream()
            print("开始播放：每个频段 1 秒，频谱从左向右移动")
            for band, chunks in enumerate(tones):
                print("频段", band + 1, "：", FREQUENCIES[band], "Hz")
                for _ in range(10):
                    for chunk in chunks:
                        session.write(chunk, wait=True)
                        refresh()
                        time.sleep_ms(1)
            session.end()
            # 末尾仍轮询并绘图，不用阻塞式 drain 遮住最后一段的频谱。
            started = time.ticks_ms()
            while session.state() != "ended":
                refresh()
                if time.ticks_diff(time.ticks_ms(), started) > 5000:
                    raise RuntimeError("播放结束等待超时")
                time.sleep_ms(10)
            pyxel.cls(0)
            pyxel.render_graphics()
            print("16 个频段播放结束")
        finally:
            pyxel.destroy()
    finally:
        try:
            if session is not None and session.state() not in ("ended", "canceled", "error"):
                session.cancel()
        finally:
            try:
                if analyzer is not None:
                    analyzer.disable()
                    analyzer.enable_dump_output(False)
            finally:
                audio.deinit()


main()
