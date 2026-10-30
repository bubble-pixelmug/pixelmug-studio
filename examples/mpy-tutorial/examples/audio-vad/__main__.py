# Audio Service API example: listen for VAD (voice activity detection) events and print state changes.
# Demonstrates audio.on("vad", callback), audio.poll(), Recorder.start, and read.
# speaking=True means speech was detected and False means speech ended; this is not speech-to-text.
# VAD notifies on state changes, does not print every frame, and may not immediately emit False at startup.

import time
import audio_service


def on_vad(event):
    speaking = event["data"]["speaking"]
    print("VAD: speech detected" if speaking else "VAD: silence detected")


def main():
    audio = audio_service.audio
    session = None
    audio.init(enable_input=True, enable_output=False,
               with_opus_encoder=False, with_opus_decoder=False)
    try:
        audio.on("vad", on_vad)
        session = audio.recorder("pcm").start()
        print("VAD detection started. Speak, then remain quiet; stop it in Studio when finished.")
        while True:
            audio.poll()  # Dispatch VAD events and call on_vad.
            while session.read(0) is not None:
                pass  # Detect voice activity only; do not save recorded data.
            time.sleep_ms(10)
    finally:
        try:
            if session is not None:
                session.cancel()
                session.close()
        finally:
            audio.deinit()


main()
