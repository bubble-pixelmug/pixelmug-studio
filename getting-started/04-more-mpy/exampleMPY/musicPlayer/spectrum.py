import time
import micropyxel as pyxel


class Spectrum:
    # 摘取 audio-visualizer 的 default 效果：16 根彩色柱和白色峰值线。
    def __init__(self):
        self.bands = bytearray(16)
        self.peaks = bytearray(16)
        self.last_decay = time.ticks_ms()
        pyxel.set_palette([
            0x000000, 0x1d2b53, 0x7e2553, 0x008751,
            0xab5236, 0x5f574f, 0xc2c3c7, 0xfff1e8,
            0xff0000, 0xf58c4f, 0xffec27, 0x00e436,
            0x00f1e4, 0x83769c, 0xff77a8, 0xffccaa,
        ])

    def draw(self, analyzer):
        pyxel.cls(0)
        if not analyzer.get_bands_u8_into(self.bands, 15, 0.03, 0.35):
            return
        now = time.ticks_ms()
        decay = time.ticks_diff(now, self.last_decay) >= 120
        if decay:
            self.last_decay = now
        for band in range(16):
            height = min(self.bands[band], 15)
            if height > self.peaks[band]:
                self.peaks[band] = height
            elif decay and self.peaks[band]:
                self.peaks[band] -= 1
            if height:
                pyxel.rect(band * 2, 16 - height, 2, height, 1 + band % 15)
            pyxel.rect(band * 2, 15 - self.peaks[band], 2, 1, 7)
