# Complete Audio Service example: normal completion, replacing active audio, and stopping playback.
# Flow: play audio1.ogg completely → play A for about 3 seconds → replace A with B → stop B after about 3 seconds.
# The play_end callback prints session_id and reason: ended / replaced / stopped.
# Demonstrates audio.on/poll, Player.open_stream(mode="replace")/stop,
# and PlaySession.write(wait=False)/end/state/id/cancel.
# Uses non-blocking streaming submission. When the queue is full, the current packet is retried while the main loop checks switch times.
# Both files are Ogg Opus; they decode to 48 kHz mono, with audio1 stereo downmixed by the decoder.
# Packet durations of 20/40/60 ms are supported; the player uses a 60 ms decode buffer.
# Replacing or stopping discards queued audio; data already sent to hardware may briefly remain audible.
# ogg.py is a helper demuxer for this example, not a built-in firmware API.
# For PixelMug S1: copy every file in this directory into the project mpy/ directory before running; no extra setup is required.

import errno
import time
import audio_service
from ogg import OggOpusStreamDemuxer


def packets_from(file):
    demux = OggOpusStreamDemuxer()
    while True:
        block = file.read(1024)
        if not block:
            if not demux.validated or not demux.seen_eos or demux.partial or demux.buf:
                raise ValueError("OGG file is incomplete")
            return
        packets = demux.feed(block)
        if demux.error:
            raise ValueError(demux.error)
        for packet in packets:
            yield packet


def main():
    audio = audio_service.audio
    active = None
    names = {}

    def on_play_end(event):
        data = event["data"]
        reason = data["reason"]
        description = {"ended": "completed normally", "replaced": "replaced by new audio",
                       "stopped": "stopped manually", "canceled": "playback canceled"}
        print("play_end:", names.get(data["session_id"], "unknown audio"),
              "session_id=", data["session_id"],
              "reason=", reason, description.get(reason, reason))

    def play_file(path, interrupt_after_ms=None):
        nonlocal active
        with open(path, "rb") as file:
            # A new session automatically replaces the old one; do not cancel the old session or it may affect new playback.
            active = player.open_stream(mode="replace")
            names[active.id()] = path
            started = time.ticks_ms()
            print("Starting playback", path, "session_id=", active.id())
            for packet in packets_from(file):
                waiting = time.ticks_ms()
                while True:
                    audio.poll()
                    if interrupt_after_ms is not None and time.ticks_diff(time.ticks_ms(), started) >= interrupt_after_ms:
                        # Keep the session active so the next open_stream can replace it or player.stop can stop it.
                        return
                    try:
                        active.write(packet, wait=False)
                        break
                    except OSError as error:
                        if not error.args or error.args[0] != errno.EAGAIN:
                            raise
                    if time.ticks_diff(time.ticks_ms(), waiting) > 5000:
                        raise RuntimeError("Timed out waiting for the playback queue")
                    time.sleep_ms(5)
                time.sleep_ms(1)
            active.end()
            started = time.ticks_ms()
            while active.state() != "ended":
                audio.poll()  # The ended callback is triggered here when playback completes naturally.
                if time.ticks_diff(time.ticks_ms(), started) > 5000:
                    raise RuntimeError("Timed out waiting for playback to finish")
                time.sleep_ms(5)

    audio.init(enable_input=False, enable_output=True,
               with_opus_encoder=False, with_opus_decoder=True)
    try:
        audio.configure(output_volume=90)
        audio.on("play_end", on_play_end)
        player = audio.player("opus", sample_rate=48000, frame_ms=60)
        print("1. Play A completely and observe the ended event")
        play_file("audio1.ogg")
        print("2. Play A again, then replace it with B after about 3 seconds")
        play_file("audio1.ogg", interrupt_after_ms=3000)
        print("3. Switch to B and observe A's replaced event")
        play_file("audio2.ogg", interrupt_after_ms=3000)
        print("4. Stop B manually and observe the stopped event")
        player.stop()  # The stopped callback is triggered during this call.
        print("Playback control example finished")
    finally:
        try:
            if active is not None and active.state() not in ("ended", "canceled", "error"):
                active.cancel()
        finally:
            audio.deinit()


main()
