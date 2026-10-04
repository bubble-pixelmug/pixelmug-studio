# Audio Service 完整用例：录制约三秒 PCM，保存为 recording.pcm，再一次提交回放。
# 展示 API：audio.init/recorder/poll/deinit，Recorder.start(sink="queue")，
# RecordSession.read/stop/state/cancel/close；停止后继续读取完整尾帧。
# 回放展示 audio.player、Player.play 和 PlaySession.drain/state/cancel。
# 文件为 16 kHz、单声道、16 位小端原始 PCM，无 WAV 文件头。
# PCM 播放固定为 48 kHz，不会自动重采样；回放前将每个样本重复三次，
# 做简单的 3 倍上采样，保持原来的时长和音调。此方法适合体验，不是高保真重采样。
# 回放分块读取文件，直接填充三倍大小的播放缓冲；每块转换后短暂休眠。
# 一次提交仍需保存完整的 48 kHz PCM（约三秒占 288 KB），仅适合短录音。
# 三秒是应用采集窗口；预热、AFE 延迟和帧边界会影响实际时长。再次运行会覆盖文件。
# 长时间录音需考虑存储空间和写入速度。

import os
import struct
import time
import audio_service


def load_recording_for_playback(path):
    size = os.stat(path)[6]
    if size == 0 or size % 2:
        raise ValueError("录音文件为空或不是完整的 16 位 PCM")
    print("录音文件：", size, "字节，准备分配播放缓冲：", size * 3, "字节")
    playback_pcm = bytearray(size * 3)
    print("播放缓冲已分配，开始分块转换……")
    offset = 0
    with open(path, "rb") as file:
        while offset < len(playback_pcm):
            chunk = file.read(min(960, (len(playback_pcm) - offset) // 3))
            if not chunk or len(chunk) % 2:
                raise ValueError("录音文件数据不完整")
            for i in range(0, len(chunk), 2):
                sample = struct.unpack_from("<h", chunk, i)[0]
                # 重复三次，将 16 kHz PCM 转为 48 kHz，直接写入目标缓冲。
                struct.pack_into("<hhh", playback_pcm, offset, sample, sample, sample)
                offset += 6
            time.sleep_ms(1)
    print("PCM 转换完成：", len(playback_pcm), "字节")
    return playback_pcm


audio = audio_service.audio
audio.init(enable_input=True, enable_output=True,
           with_opus_encoder=False, with_opus_decoder=False)
session = None
play_session = None
try:
    print("开始录音，请说话（约 3 秒）……")
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
                raise RuntimeError("录音尾帧等待超时")
            time.sleep_ms(5)
    print("录音结束，已保存：recording.pcm，正在准备回放……")
    session.close()
    session = None

    playback_pcm = load_recording_for_playback("recording.pcm")

    audio.configure(output_volume=100)
    player = audio.player("pcm", sample_rate=48000, frame_ms=20)
    print("开始回放录音……")
    play_session = player.play(playback_pcm)
    play_session.drain(5000)
    if play_session.state() != "ended":
        raise RuntimeError("录音回放等待超时")
    print("回放结束")
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
