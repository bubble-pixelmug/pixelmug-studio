# 提示音播放器示例：使用触摸触发可互相打断的 Ogg Opus 提示音。
# 第一次按下触摸区域会生成一个向上漂浮的泡泡，并播放 bubble-create-optimized.ogg。
# 泡泡离开屏幕前再次按下会戳破泡泡，并播放 bubble-pop-optimized.ogg。
# 新提示音会打断尚未结束的上一个提示音。
# 替换资源应为 48 kHz、单声道、固定 60 ms 包的 Ogg Opus 文件。

import random

import audio_service
import micropyxel as upyxel
import mpy_button
from pyxel_prompt_sound import PromptSoundPlayer


FPS = 20
OUTPUT_VOLUME = 90

CREATE_SOUND = "bubble-create.ogg"
POP_SOUND = "bubble-pop.ogg"

BACKGROUND_COLOR = 0
BUBBLE_COLOR = 6
HIGHLIGHT_COLOR = 7
POP_COLOR = 12


def main():
    audio = audio_service.audio
    audio.init(
        enable_input=False,
        enable_output=True,
        with_opus_encoder=False,
        with_opus_decoder=True,
    )
    audio.configure(output_volume=OUTPUT_VOLUME)

    upyxel.init(start_audio=False)
    sound = PromptSoundPlayer(
        audio=audio,
        asset_root="assets",
        stop_handler=lambda player: player.cancel(),
    )

    bubble = None
    burst = None
    last_pressed = bool(mpy_button.is_pressed())

    def play_sound(path):
        interrupt = sound.is_playing()
        if not sound.play(path, interrupt=interrupt):
            print("播放失败：", path, sound.last_error)


    def create_bubble(rt):
        nonlocal bubble, burst
        radius = random.randint(2, 5)
        bubble = {
            "x": float(random.randint(radius, rt.width - 1 - radius)),
            "y": float(rt.height + radius),
            "radius": radius,
            "rise": random.randint(2, 5) / 10,
            "drift": random.randint(-2, 2) / 10,
        }
        burst = None
        play_sound(CREATE_SOUND)
        print("生成泡泡，半径：", radius)

    def pop_bubble():
        nonlocal bubble, burst
        burst = {
            "x": bubble["x"],
            "y": bubble["y"],
            "radius": bubble["radius"],
            "frames": 4,
        }
        bubble = None
        play_sound(POP_SOUND)
        print("泡泡破裂")

    def update_bubble(rt):
        nonlocal bubble, burst

        if bubble is not None:
            bubble["y"] -= bubble["rise"]
            bubble["x"] += bubble["drift"]

            radius = bubble["radius"]
            if bubble["x"] <= radius:
                bubble["x"] = float(radius)
                bubble["drift"] = abs(bubble["drift"])
            elif bubble["x"] >= rt.width - 1 - radius:
                bubble["x"] = float(rt.width - 1 - radius)
                bubble["drift"] = -abs(bubble["drift"])

            if bubble["y"] + radius < 0:
                bubble = None

        if burst is not None:
            burst["radius"] += 1
            burst["frames"] -= 1
            if burst["frames"] <= 0:
                burst = None

    def update(rt):
        nonlocal last_pressed

        sound.update()

        pressed = bool(mpy_button.is_pressed())
        if pressed and not last_pressed:
            if bubble is None:
                create_bubble(rt)
            else:
                pop_bubble()
        last_pressed = pressed

        update_bubble(rt)

    def draw(rt):
        rt.cls(BACKGROUND_COLOR)

        if bubble is not None:
            x = int(bubble["x"])
            y = int(bubble["y"])
            radius = bubble["radius"]
            rt.circb(x, y, radius, BUBBLE_COLOR)
            rt.pset(x - radius // 2, y - radius // 2, HIGHLIGHT_COLOR)

        if burst is not None:
            rt.circb(
                int(burst["x"]),
                int(burst["y"]),
                burst["radius"],
                POP_COLOR,
            )

    mpy_button.clear()
    sound.preload_many((CREATE_SOUND, POP_SOUND))

    try:
        print("提示音示例开始：按下触摸区域生成或戳破泡泡")
        upyxel.run(update, draw, fps=FPS)
    finally:
        sound.deinit()
        mpy_button.clear()
        upyxel.destroy()
        audio.deinit()


main()