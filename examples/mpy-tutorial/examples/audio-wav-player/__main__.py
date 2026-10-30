# Complete Audio Service example: read local audio.wav in chunks and stream it as PCM.
# Demonstrates audio.init/configure/player/poll/deinit, Player.open_stream,
# and PlaySession.write/end/drain/state/cancel.
# The file must be standard RIFF/WAVE, PCM encoded, 48 kHz, mono, 16-bit little-endian audio.
# WAV files have a header and cannot be submitted as raw PCM directly. This example locates the fmt and data chunks,
# skips other metadata chunks, plays only the data chunk, and does not assume a fixed 44-byte header.
# Each read is at most 1920 bytes (20 ms), so the entire audio file is not loaded into memory.
# For PixelMug S1: copy every file in this directory, including audio.wav, into the project mpy/ directory before running.
# Use ffmpeg to convert replacement audio:
# ffmpeg -i input.wav -ac 1 -ar 48000 -c:a pcm_s16le audio.wav

import struct
import time
import audio_service


def find_pcm_data(file):
    header = file.read(12)
    if len(header) != 12 or header[:4] != b"RIFF" or header[8:] != b"WAVE":
        raise ValueError("File is not RIFF/WAVE")
    format_ok = False
    while True:
        header = file.read(8)
        if len(header) != 8:
            raise ValueError("WAV is missing a data chunk")
        kind, size = struct.unpack("<4sI", header)
        if kind == b"fmt ":
            fmt = file.read(16) if size >= 16 else b""
            if len(fmt) != 16:
                raise ValueError("WAV fmt chunk is incomplete")
            encoding, channels, rate, byte_rate, align, bits = struct.unpack("<HHIIHH", fmt)
            if (encoding, channels, rate, byte_rate, align, bits) != (1, 1, 48000, 96000, 2, 16):
                raise ValueError("A 48 kHz mono 16-bit PCM WAV file is required")
            format_ok = True
            file.seek(size - 16 + size % 2, 1)
        elif kind == b"data":
            if not format_ok or size == 0 or size % 2:
                raise ValueError("Invalid WAV format or PCM data length")
            return size  # The file position is at the start of the PCM data.
        else:
            file.seek(size + size % 2, 1)  # RIFF chunks are aligned to even byte boundaries.


def main():
    audio = audio_service.audio
    session = None
    with open("audio.wav", "rb") as file:
        remaining = find_pcm_data(file)
        print("Playing audio.wav, duration about", remaining / 96000, "seconds")
        audio.init(enable_input=False, enable_output=True,
                   with_opus_encoder=False, with_opus_decoder=False)
        try:
            audio.configure(output_volume=100)
            player = audio.player("pcm", sample_rate=48000, frame_ms=20)
            session = player.open_stream()
            while remaining:
                chunk = file.read(min(1920, remaining))
                if not chunk or len(chunk) % 2:
                    raise ValueError("WAV audio data is incomplete")
                session.write(chunk, wait=True)
                remaining -= len(chunk)
                audio.poll()
                time.sleep_ms(1)
            session.end()
            session.drain(5000)
            if session.state() != "ended":
                raise RuntimeError("Timed out waiting for WAV playback to finish")
            print("audio.wav playback finished")
        finally:
            try:
                if session is not None and session.state() not in ("ended", "canceled", "error"):
                    session.cancel()
            finally:
                audio.deinit()


main()
