# MicroPyxel sprite animation driven by audio_service VAD events.
# Demonstrates images, load_from_png, blt, run, audio.on("vad"), audio.poll(),
# and recorder.start/read.
# canvas.png contains three 8x8 bird sprites arranged horizontally at (0, 0),
# (8, 0), and (16, 0). The animation cycles while speech is detected and holds
# the current frame when the environment is quiet.
# Audio data is used only to trigger VAD; it is read and discarded rather than saved.

import audio_service
import micropyxel as upyxel


FPS = 20
SPRITE_SIZE = 8
SPRITE_COUNT = 3
FRAME_HOLD = 2
DRAW_X = 12
DRAW_Y = 4


def main():
    audio = audio_service.audio
    session = None
    speaking = False
    sprite_frame = 0
    animation_tick = 0

    def on_vad(event):
        nonlocal speaking
        speaking = event["data"]["speaking"]
        print(
            "Someone is speaking; the bird starts flapping"
            if speaking
            else "The environment is quiet; the bird holds its current frame"
        )

    audio.init(
        enable_input=True,
        enable_output=False,
        with_opus_encoder=False,
        with_opus_decoder=False,
    )
    try:
        audio.on("vad", on_vad)
        session = audio.recorder("pcm").start()

        upyxel.init(start_audio=False)
        try:
            image_bank = upyxel.images(0)
            image_bank.load_from_png(0, 0, "canvas.png", True)

            def update(rt):
                nonlocal sprite_frame, animation_tick

                # poll() delivers VAD state changes and invokes on_vad.
                audio.poll()
                while audio.get_event() is not None:
                    pass  # Remove events after their callbacks have run.
                # Queue mode still produces PCM data; read and discard it promptly.
                while session.read(0) is not None:
                    pass

                if speaking:
                    animation_tick += 1
                    if animation_tick >= FRAME_HOLD:
                        animation_tick = 0
                        sprite_frame = (sprite_frame + 1) % SPRITE_COUNT

            def draw(rt):
                rt.cls(0)
                rt.blt(
                    DRAW_X,
                    DRAW_Y,
                    0,
                    sprite_frame * SPRITE_SIZE,
                    0,
                    SPRITE_SIZE,
                    SPRITE_SIZE,
                    0,
                )

            print("VAD bird animation started; speak to the PixelMug")
            upyxel.run(update, draw, fps=FPS)
        finally:
            upyxel.destroy()
    finally:
        try:
            audio.on("vad", None)
            if session is not None:
                session.cancel()
                session.close()
        finally:
            audio.deinit()


main()
