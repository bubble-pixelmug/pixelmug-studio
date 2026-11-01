# Complete Audio Service example: record about three seconds of Opus through events, then stream it back.
# Demonstrates audio.on/poll, Recorder.start(sink="event"), RecordSession.cancel/close,
# and Player.open_stream, PlaySession.write/end/drain/state/cancel.

import time
import audio_service


def main():
    audio = audio_service.audio
    packets = []
    record_session = None
    play_session = None

    def on_frame(event):
        packets.append(event["data"]["payload"])

    audio.init(enable_input=True, enable_output=True,
               with_opus_encoder=True, with_opus_decoder=True)
    try:
        audio.configure(output_volume=100, input_gain=150)
        audio.on("record_frame", on_frame)
        print("Starting Opus recording; speak for about 3 seconds...")
        record_session = audio.recorder("opus").start(sink="event")
        started = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), started) < 3000:
            audio.poll()  # Dispatch record_frame and call on_frame here.
            time.sleep_ms(5)

        record_session.cancel()  # Keep packets already received and discard undelivered tail frames.
        record_session.close()
        record_session = None
        audio.on("record_frame", None)
        print("Recording finished; received", len(packets), "Opus packets")
        if not packets:
            print("No recording data received; skipping playback")
            return

        player = audio.player("opus", sample_rate=48000, frame_ms=60)
        play_session = player.open_stream()
        print("Starting streamed playback...")
        for packet in packets:
            # Submit one complete Opus packet at a time; wait when the queue is full.
            play_session.write(packet, wait=True)
            audio.poll()
            time.sleep_ms(1)
        play_session.end()
        play_session.drain(5000)
        if play_session.state() != "ended":
            raise RuntimeError("Timed out waiting for Opus playback")
        print("Playback finished")
    finally:
        try:
            if record_session is not None:
                record_session.cancel()
                record_session.close()
        finally:
            try:
                if play_session is not None and play_session.state() not in ("ended", "canceled", "error"):
                    play_session.cancel()
            finally:
                audio.deinit()


main()
