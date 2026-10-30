# Complete Audio Service example: generate and play a half-second 440 Hz PCM tone.
# Demonstrates audio.init/configure/player/deinit, Player.play,
# and PlaySession.drain/state/cancel.
# PCM is 48 kHz, mono, 16-bit little-endian; half a second has 24,000 samples and uses 48,000 bytes.
# Generate the complete PCM buffer first, then let Player play it in 20 ms chunks to avoid underruns during computation.
# The sample peak of 6000 and output_volume both affect volume; the maximum positive signed 16-bit value is 32767.

import math
import struct
import audio_service

# Generate all samples before playback starts.
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
        raise RuntimeError("Timed out waiting for playback")
finally:
    try:
        if session is not None and session.state() not in ("ended", "canceled", "error"):
            session.cancel()
    finally:
        audio.deinit()
