# Audio Service 完整用例：生成并播放半秒 440 Hz PCM 提示音。
# 展示 API：audio.init/configure/player/deinit，Player.play，
# PlaySession.drain/state/cancel。
# PCM 为 48 kHz、单声道、16 位小端；半秒共 24000 个样本，占 48000 字节。
# 先生成完整 PCM，再交给 Player 按 20 ms 分块播放，避免边计算边播放造成断供。
# 样本峰值 6000 与 output_volume 都影响音量；有符号 16 位最大正值为 32767。

import math
import struct
import audio_service

# 先生成所有样本，计算期间尚未开始播放。
pcm = bytearray(24000 * 2)
for i in range(24000):
    value = int(6000 * math.sin(2 * math.pi * 440 * i / 48000))
    struct.pack_into("<h", pcm, i * 2, value)

audio = audio_service.audio
audio.init(enable_input=False, enable_output=True,
           with_opus_encoder=False, with_opus_decoder=False)
session = None
try:
    audio.configure(output_volume=100)
    player = audio.player("pcm", sample_rate=48000, frame_ms=20)
    session = player.play(pcm)
    session.drain(3000)
    if session.state() != "ended":
        raise RuntimeError("播放等待超时")
finally:
    try:
        if session is not None and session.state() not in ("ended", "canceled", "error"):
            session.cancel()
    finally:
        audio.deinit()
