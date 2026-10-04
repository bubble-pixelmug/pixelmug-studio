# Audio Service 完整用例：事件型录制约三秒 Opus，然后流式回放。
# 展示 API：audio.on/poll、Recorder.start(sink="event")、RecordSession.cancel/close，
# 以及 Player.open_stream、PlaySession.write/end/drain/state/cancel。

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
        audio.configure(output_volume=100)
        audio.on("record_frame", on_frame)
        print("开始 Opus 录音，请说话（约 3 秒）……")
        record_session = audio.recorder("opus").start(sink="event")
        started = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), started) < 3000:
            audio.poll()  # 在这里分发 record_frame，调用 on_frame。
            time.sleep_ms(5)

        record_session.cancel()  # 保留 packets 中已收到的包，丢弃未交付的尾帧。
        record_session.close()
        record_session = None
        audio.on("record_frame", None)
        print("录音结束，共收到", len(packets), "个 Opus 包")
        if not packets:
            print("未收到录音数据，本次不回放")
            return

        player = audio.player("opus", sample_rate=48000, frame_ms=60)
        play_session = player.open_stream()
        print("开始流式回放……")
        for packet in packets:
            # 每次提交一个完整 Opus 包；队列满时等待空位。
            play_session.write(packet, wait=True)
            audio.poll()
            time.sleep_ms(1)
        play_session.end()
        play_session.drain(5000)
        if play_session.state() != "ended":
            raise RuntimeError("Opus 回放等待超时")
        print("回放结束")
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
