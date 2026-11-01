# Complete Audio Service example: record about three seconds of PCM, save it as recording.pcm, and play it back in one submission.
# Demonstrates audio.init/recorder/poll/deinit, Recorder.start(sink="queue"),
# and RecordSession.read/stop/state/cancel/close; continue reading the complete tail after stopping.
# Playback demonstrates audio.player, Player.play, and PlaySession.drain/state/cancel.
# The file is raw 16 kHz, mono, 16-bit little-endian PCM with no WAV header.
# PCM playback is fixed at 48 kHz and does not resample automatically. Each sample is repeated three times before playback
# for simple 3× upsampling that preserves the original duration and pitch. This is suitable for demonstration, not high-fidelity resampling.
# Read the recording in chunks and fill a playback buffer three times its size; briefly sleep after converting each chunk.
# A complete 48 kHz PCM buffer is still required for one submission (about 288 KB for three seconds), so this is suitable only for short recordings.
# Three seconds is the application's capture window; warm-up, AFE latency, and frame boundaries affect the actual duration. Running again overwrites the file.
# Long recordings require consideration of storage capacity and write speed.

import os
import struct
import time
import audio_service


def load_recording_for_playback(path):
    size = os.stat(path)[6]
    if size == 0 or size % 2:
        raise ValueError("Recording is empty or is not complete 16-bit PCM")
    print("Recording:", size, "bytes; allocating playback buffer:", size * 3, "bytes")
    playback_pcm = bytearray(size * 3)
    print("Playback buffer allocated; converting in chunks...")
    offset = 0
    with open(path, "rb") as file:
        while offset < len(playback_pcm):
            chunk = file.read(min(960, (len(playback_pcm) - offset) // 3))
            if not chunk or len(chunk) % 2:
                raise ValueError("Recording data is incomplete")
            for i in range(0, len(chunk), 2):
                sample = struct.unpack_from("<h", chunk, i)[0]
                # Repeat each sample three times to convert 16 kHz PCM to 48 kHz in the destination buffer.
                struct.pack_into("<hhh", playback_pcm, offset, sample, sample, sample)
                offset += 6
            time.sleep_ms(1)
    print("PCM conversion complete:", len(playback_pcm), "bytes")
    return playback_pcm


audio = audio_service.audio
audio.init(enable_input=True, enable_output=True,
           with_opus_encoder=False, with_opus_decoder=False)
session = None
play_session = None
try:
    print("Recording started; speak for about 3 seconds...")
    session = audio.recorder("pcm").start()
    with open("recording.pcm", "wb") as file:
        started = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), started) < 3000:
            audio.poll()
            frame = session.read(20)
            if frame is not None:
                file.write(frame["payload"])
            time.sleep_ms(1)

        session.stop()
        draining = time.ticks_ms()
        while session.state() == "stopping":
            frame = session.read(0)
            if frame is not None:
                file.write(frame["payload"])
            audio.poll()
            if time.ticks_diff(time.ticks_ms(), draining) > 2000:
                raise RuntimeError("Timed out waiting for the final recording frames")
            time.sleep_ms(5)
    print("Recording finished and saved as recording.pcm; preparing playback...")
    session.close()
    session = None

    playback_pcm = load_recording_for_playback("recording.pcm")

    audio.configure(output_volume=100, input_gain=150)
    player = audio.player("pcm", sample_rate=48000, frame_ms=20)
    print("Starting recording playback...")
    play_session = player.play(playback_pcm)
    play_session.drain(5000)
    if play_session.state() != "ended":
        raise RuntimeError("Timed out waiting for recording playback")
    print("Playback finished")
finally:
    try:
        if session is not None:
            if session.state() not in ("ended", "canceled", "error"):
                session.cancel()
            session.close()
    finally:
        try:
            if play_session is not None and play_session.state() not in ("ended", "canceled", "error"):
                play_session.cancel()
        finally:
            audio.deinit()
