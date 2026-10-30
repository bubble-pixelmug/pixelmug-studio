# Complete Audio Service + MicroPyxel example: play test tones for 16 bands in sequence and display the actual output spectrum.
# The “16 channels” here are the 16 spectrum bands; PCM remains 48 kHz, mono, 16-bit little-endian.
# Each band plays for 1 second, for 16 seconds total, from low to high frequency; the bars are not simulated from playback order.
# Demonstrates Player.open_stream/write/end, enable_dump_output(True), enable_on_pcm(2),
# get_bands_u8_into, and MicroPyxel drawing.
# Uses a 4096-point FFT (about 11.72 Hz resolution at 48 kHz) so the leftmost low-frequency band has a frequency bin.
# The finite FFT window can occasionally make adjacent bars appear; an approximately 85 ms transition window may also contain two tones.
# Generate 100 ms of PCM for each tone and repeat it ten times; do not calculate sine waves during playback.
# All frequencies are integer multiples of 10 Hz, so 100 ms contains whole cycles and repeated playback remains phase-continuous.
# The 16 PCM buffers use about 154 KB total; submit 20 ms at a time while continuing to feed audio during drawing.
# MicroPyxel only draws and does not synthesize sound; no recording or media files are required.

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
        pcm = bytearray(4800 * 2)  # 100 ms.
        for i in range(4800):
            sample = int(6000 * math.sin(2 * math.pi * frequency * i / 48000))
            struct.pack_into("<h", pcm, i * 2, sample)
            if i % 480 == 0:
                time.sleep_ms(1)
        view = memoryview(pcm)
        # memoryview references the original buffer without copying audio; each chunk is 960 samples, or 20 ms.
        tones.append([view[i:i + 1920] for i in range(0, len(pcm), 1920)])
    return tones


def main():
    print("Generating test tones for 16 bands; please wait...")
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
            print("Playback started: each band lasts 1 second and the spectrum moves from left to right")
            for band, chunks in enumerate(tones):
                print("Band", band + 1, ":", FREQUENCIES[band], "Hz")
                for _ in range(10):
                    for chunk in chunks:
                        session.write(chunk, wait=True)
                        refresh()
                        time.sleep_ms(1)
            session.end()
            # Continue polling and drawing at the end instead of hiding the final spectrum segment with blocking drain.
            started = time.ticks_ms()
            while session.state() != "ended":
                refresh()
                if time.ticks_diff(time.ticks_ms(), started) > 5000:
                    raise RuntimeError("Timed out waiting for playback to finish")
                time.sleep_ms(10)
            pyxel.cls(0)
            pyxel.render_graphics()
            print("Playback finished for all 16 bands")
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
