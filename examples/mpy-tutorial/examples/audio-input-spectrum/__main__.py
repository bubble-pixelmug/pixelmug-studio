# Audio Service + MicroPyxel 完整用例：显示十秒麦克风频谱，然后退出。
# 展示 API：audio.spectrum_analyzer/recorder/poll，enable_dump_input，
# enable_on_pcm(1)、set_fps、get_bands_u8_into、disable，以及 MicroPyxel 绘图。
# 及时读取并丢弃录音帧，避免队列堵塞；复用 16 字节频谱缓冲减少分配。
# MicroPyxel 仅绘图，使用 start_audio=False，不启动声音合成。
# 若柱子太低可降低 noise 或 amplitude；这些参数仅改变频谱显示。
# 结束时停止 FFT、关闭 dump，再释放 Audio Service 和绘图资源。

import time
import audio_service
import micropyxel as pyxel


def main():
    audio = audio_service.audio
    session = None
    analyzer = None
    audio.init(enable_input=True, enable_output=False,
               with_opus_encoder=False, with_opus_decoder=False)
    try:
        analyzer = audio.spectrum_analyzer(
            fft_size=512, sample_rate=16000, pcm_ringbuf_cap=2048
        )
        analyzer.set_fps(25)
        analyzer.enable_dump_input(True)
        analyzer.enable_on_pcm(1)
        session = audio.recorder("pcm").start()
        heights = bytearray(16)

        pyxel.init(start_audio=False)
        try:
            started = time.ticks_ms()
            while time.ticks_diff(time.ticks_ms(), started) < 10000:
                audio.poll()
                # 不保存录音，但仍及时取走帧，避免录音队列堵住采集。
                while session.read(0) is not None:
                    pass
                pyxel.cls(0)
                if analyzer.get_bands_u8_into(heights, 16) == 16:
                    for i in range(16):
                        height = heights[i]
                        if height:
                            pyxel.rect(i * 2, 16 - height, 1, height, 11)
                pyxel.render_graphics()
                time.sleep_ms(40)
        finally:
            pyxel.destroy()
    finally:
        try:
            if session is not None:
                session.cancel()  # 此例不保存尾帧。
                session.close()
        finally:
            try:
                if analyzer is not None:
                    analyzer.disable()
                    analyzer.enable_dump_input(False)
            finally:
                audio.deinit()


main()
