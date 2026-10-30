# Complete Audio Service + MicroPyxel example: display the microphone spectrum for ten seconds, then exit.
# Demonstrates audio.spectrum_analyzer/recorder/poll, enable_dump_input,
# enable_on_pcm(1), set_fps, get_bands_u8_into, disable, and MicroPyxel drawing.
# Read and discard recording frames promptly to avoid blocking the queue; reuse a 16-byte spectrum buffer to reduce allocations.
# MicroPyxel only draws with start_audio=False, so audio synthesis is not started.
# If the bars are too low, reduce noise or amplitude; these parameters only change the spectrum display.
# At the end, stop the FFT, disable the dump, and release Audio Service and drawing resources.

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
                # Do not save the recording, but read frames promptly so the recording queue does not block capture.
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
                session.cancel()  # This example does not save the tail frames.
                session.close()
        finally:
            try:
                if analyzer is not None:
                    analyzer.disable()
                    analyzer.enable_dump_input(False)
            finally:
                audio.deinit()


main()
