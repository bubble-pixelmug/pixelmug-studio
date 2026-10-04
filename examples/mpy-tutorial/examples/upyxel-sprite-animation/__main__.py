# MicroPyxel 逐帧动画示例：用 Audio Service 的 VAD 驱动小鸟扇动翅膀。
# 展示 API：images、load_from_png、blt、run，以及
# audio.on("vad", callback)、audio.poll()、Recorder.start 和 read。
#
# canvas.png 左上角依次排列三张 8x8 小鸟精灵：
# 第 0 帧位于 (0, 0)，第 1 帧位于 (8, 0)，第 2 帧位于 (16, 0)。
# VAD 检测到有人说话时循环播放三帧；没有说话时停留在当前帧。
# 程序只使用录音数据触发 VAD，不保存声音，因此每次更新都会清空录音队列。

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
        print("有人说话，小鸟开始扇动翅膀" if speaking else "环境安静，小鸟停在当前帧")

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

                # poll() 交付 VAD 状态变化并同步调用 on_vad。
                audio.poll()
                while audio.get_event() is not None:
                    pass  # 回调执行后事件仍在队列中；本例已处理，及时移除。

                # queue 模式仍会产生 PCM 数据；本例不使用声音内容，及时读出并丢弃。
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

            print("VAD 小鸟动画已启动：请对着 PixelMug 说话")
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