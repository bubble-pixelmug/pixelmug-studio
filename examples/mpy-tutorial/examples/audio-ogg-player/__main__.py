# Audio Service 完整用例：逐块读取本地 test_audio.ogg，拆包后流式播放。
# 展示 API：audio.init/configure/player/poll/deinit，Player.open_stream，
# PlaySession.write(wait=False)/drain/state/cancel；队列满时保留当前包并重试。

import time
import errno
import audio_service
from ogg import OggOpusStreamDemuxer


def packets_from(file, demux):
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


audio = audio_service.audio
session = None
try:
    with open("test_audio.ogg", "rb") as file:
        demux = OggOpusStreamDemuxer()
        packets = packets_from(file, demux)
        first = next(packets)  # 先解析文件头与首包，获得包时长。
        audio.init(enable_input=False, enable_output=True,
                   with_opus_encoder=False, with_opus_decoder=True)
        audio.configure(output_volume=90)
        player = audio.player("opus", frame_ms=demux.frame_ms)
        session = player.open_stream()

        def write_packet(packet):
            started = time.ticks_ms()
            while True:
                audio.poll()
                try:
                    session.write(packet, wait=False)
                    return
                except OSError as error:
                    if not error.args or error.args[0] != errno.EAGAIN:
                        raise
                if time.ticks_diff(time.ticks_ms(), started) > 5000:
                    raise RuntimeError("音频队列等待超时")
                time.sleep_ms(5)

        write_packet(first)
        for packet in packets:
            write_packet(packet)
        session.drain(5000)
        if session.state() != "ended":
            raise RuntimeError("播放结束等待超时")
finally:
    try:
        if session is not None and session.state() not in ("ended", "canceled", "error"):
            session.cancel()
    finally:
        audio.deinit()
