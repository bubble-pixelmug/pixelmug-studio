# Audio Service 完整用例：分块读取本地 audio.wav，以 PCM 流式播放。
# 展示 API：audio.init/configure/player/poll/deinit，Player.open_stream，
# PlaySession.write/end/drain/state/cancel。
# 素材必须为标准 RIFF/WAVE、PCM 编码、48 kHz、单声道、16 位小端。
# WAV 有文件头，不能把整个文件直接作为 PCM 提交；本例查找 fmt 和 data 块，
# 跳过其它元数据块，仅播放 data 中的声音，不假设文件头固定为 44 字节。
# 每次读取最多 1920 字节（20 ms），不把整首音频读入内存。
# PixelMug S1 系列：将本目录全部文件（含 audio.wav）复制到项目 mpy/ 后运行。
# 替换素材时可用 ffmpeg 转换：
# ffmpeg -i input.wav -ac 1 -ar 48000 -c:a pcm_s16le audio.wav

import struct
import time
import audio_service


def find_pcm_data(file):
    header = file.read(12)
    if len(header) != 12 or header[:4] != b"RIFF" or header[8:] != b"WAVE":
        raise ValueError("文件不是 RIFF/WAVE")
    format_ok = False
    while True:
        header = file.read(8)
        if len(header) != 8:
            raise ValueError("WAV 缺少 data 块")
        kind, size = struct.unpack("<4sI", header)
        if kind == b"fmt ":
            fmt = file.read(16) if size >= 16 else b""
            if len(fmt) != 16:
                raise ValueError("WAV fmt 块不完整")
            encoding, channels, rate, byte_rate, align, bits = struct.unpack("<HHIIHH", fmt)
            if (encoding, channels, rate, byte_rate, align, bits) != (1, 1, 48000, 96000, 2, 16):
                raise ValueError("需要 48 kHz、单声道、16 位 PCM WAV")
            format_ok = True
            file.seek(size - 16 + size % 2, 1)
        elif kind == b"data":
            if not format_ok or size == 0 or size % 2:
                raise ValueError("WAV 格式或 PCM 数据长度无效")
            return size  # 文件位置停在 PCM 数据起点。
        else:
            file.seek(size + size % 2, 1)  # RIFF 块按偶数字节对齐。


def main():
    audio = audio_service.audio
    session = None
    with open("audio.wav", "rb") as file:
        remaining = find_pcm_data(file)
        print("开始播放 audio.wav，时长约", remaining / 96000, "秒")
        audio.init(enable_input=False, enable_output=True,
                   with_opus_encoder=False, with_opus_decoder=False)
        try:
            audio.configure(output_volume=100)
            player = audio.player("pcm", sample_rate=48000, frame_ms=20)
            session = player.open_stream()
            while remaining:
                chunk = file.read(min(1920, remaining))
                if not chunk or len(chunk) % 2:
                    raise ValueError("WAV 音频数据不完整")
                session.write(chunk, wait=True)
                remaining -= len(chunk)
                audio.poll()
                time.sleep_ms(1)
            session.end()
            session.drain(5000)
            if session.state() != "ended":
                raise RuntimeError("WAV 播放结束等待超时")
            print("audio.wav 播放结束")
        finally:
            try:
                if session is not None and session.state() not in ("ended", "canceled", "error"):
                    session.cancel()
            finally:
                audio.deinit()


main()
