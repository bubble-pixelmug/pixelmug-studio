# Audio Service 完整用例：正常结束、替换正在播放的声音、主动停止。
# 流程：完整播放 audio1.ogg → 再播放 A 约 3 秒 → 用 B 替换 A → 约 3 秒后停止 B。
# 通过 play_end 回调打印 session_id 和 reason：ended / replaced / stopped。
# 展示 API：audio.on/poll，Player.open_stream(mode="replace")/stop，
# PlaySession.write(wait=False)/end/state/id/cancel。
# 使用非阻塞流式提交，队列满时保留当前包重试，主循环仍能检查切换时间。
# 两段文件均为 Ogg Opus；解码为 48 kHz 单声道，audio1 的双声道由解码器下混。
# 包时长支持 20/40/60 ms；播放器按最长 60 ms 配置解码缓冲。
# 替换或停止会丢弃排队的声音，已进入硬件输出的数据可能有短暂残留。
# ogg.py 是示例拆包辅助模块，不是固件内置 API。
# PixelMug S1 系列：将本目录全部文件复制到项目 mpy/ 后运行，无需额外操作。

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
                raise ValueError("OGG 文件不完整")
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
        description = {"ended": "正常结束", "replaced": "被新声音替换",
                       "stopped": "主动停止", "canceled": "取消播放"}
        print("play_end：", names.get(data["session_id"], "未知声音"),
              "session_id=", data["session_id"],
              "reason=", reason, description.get(reason, reason))

    def play_file(path, interrupt_after_ms=None):
        nonlocal active
        with open(path, "rb") as file:
            # 新会话自动替换旧会话；不要再取消旧会话，否则会影响新播放。
            active = player.open_stream(mode="replace")
            names[active.id()] = path
            started = time.ticks_ms()
            print("开始播放", path, "session_id=", active.id())
            for packet in packets_from(file):
                waiting = time.ticks_ms()
                while True:
                    audio.poll()
                    if interrupt_after_ms is not None and time.ticks_diff(time.ticks_ms(), started) >= interrupt_after_ms:
                        # 保持会话活动，交由下一次 open_stream 替换，或 player.stop 停止。
                        return
                    try:
                        active.write(packet, wait=False)
                        break
                    except OSError as error:
                        if not error.args or error.args[0] != errno.EAGAIN:
                            raise
                    if time.ticks_diff(time.ticks_ms(), waiting) > 5000:
                        raise RuntimeError("等待播放队列超时")
                    time.sleep_ms(5)
                time.sleep_ms(1)
            active.end()
            started = time.ticks_ms()
            while active.state() != "ended":
                audio.poll()  # 自然播放结束时，从这里触发 ended 回调。
                if time.ticks_diff(time.ticks_ms(), started) > 5000:
                    raise RuntimeError("等待播放结束超时")
                time.sleep_ms(5)

    audio.init(enable_input=False, enable_output=True,
               with_opus_encoder=False, with_opus_decoder=True)
    try:
        audio.configure(output_volume=90)
        audio.on("play_end", on_play_end)
        player = audio.player("opus", sample_rate=48000, frame_ms=60)
        print("1. 完整播放 A，观察 ended 事件")
        play_file("audio1.ogg")
        print("2. 再播放 A，约 3 秒后用 B 替换")
        play_file("audio1.ogg", interrupt_after_ms=3000)
        print("3. 切换到 B，观察 A 的 replaced 事件")
        play_file("audio2.ogg", interrupt_after_ms=3000)
        print("4. 主动停止 B，观察 stopped 事件")
        player.stop()  # stopped 回调会在此调用内触发。
        print("播放控制演示结束")
    finally:
        try:
            if active is not None and active.state() not in ("ended", "canceled", "error"):
                active.cancel()
        finally:
            audio.deinit()


main()
