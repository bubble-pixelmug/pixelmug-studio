# Audio Service API 示例：监听 VAD（语音活动检测）事件并打印状态变化。
# 展示 API：audio.on("vad", callback)、audio.poll()、Recorder.start 和 read。
# speaking=True 表示检测到说话，False 表示变为非说话状态；不是语音转文字。
# VAD 在状态变化时通知，不会每帧打印，也不保证启动时立即收到一次 False。

import time
import audio_service


def on_vad(event):
    speaking = event["data"]["speaking"]
    print("VAD：有人说话了" if speaking else "VAD：现在安静了")


def main():
    audio = audio_service.audio
    session = None
    audio.init(enable_input=True, enable_output=False,
               with_opus_encoder=False, with_opus_decoder=False)
    try:
        audio.on("vad", on_vad)
        session = audio.recorder("pcm").start()
        print("VAD 检测已启动，请说话，然后保持安静；可在 Studio 中停止。")
        while True:
            audio.poll()  # 分发 VAD 事件并调用 on_vad。
            while session.read(0) is not None:
                pass  # 只检测语音活动，不保存录音数据。
            time.sleep_ms(10)
    finally:
        try:
            if session is not None:
                session.cancel()
                session.close()
        finally:
            audio.deinit()


main()
