import time
import audio_service
import micropyxel as pyxel
import mpy_button
from ogg import OggOpusStreamDemuxer
from spectrum import Spectrum

AUDIO_FILE = "test_audio.ogg"
VOLUME = 90
FPS = 24


def wait_for_click(message):
    # Scroll messages that are wider than the 32-pixel display.
    mpy_button.clear()
    x = 32
    tip_y = 15
    last_bounce = time.ticks_ms()
    while True:
        if mpy_button.get() == "click":
            return
        pyxel.cls(0)
        pyxel.text(x, 4, message, 7)
        now = time.ticks_ms()
        if time.ticks_diff(now, last_bounce) >= 180:
            tip_y = 14 if tip_y == 15 else 15
            last_bounce = now
        # Three pixels form an inverted triangle whose tip bounces by one pixel.
        pyxel.pset(15, tip_y - 1, 8)
        pyxel.pset(17, tip_y - 1, 8)
        pyxel.pset(16, tip_y, 8)
        pyxel.render_graphics()
        x -= 1
        if x < -len(message) * 4:
            x = 32
        time.sleep_ms(60)


def packets_from(file, demux):
    while True:
        chunk = file.read(1024)
        if not chunk:
            if not demux.validated or not demux.seen_eos or demux.partial or demux.buf:
                raise ValueError("Incomplete Ogg Opus file")
            return
        packets = demux.feed(chunk)
        if demux.error:
            raise ValueError(demux.error)
        for packet in packets:
            yield packet


def play():
    audio = audio_service.audio
    session = None
    analyzer = None
    try:
        with open(AUDIO_FILE, "rb") as file:
            demux = OggOpusStreamDemuxer()
            packets = packets_from(file, demux)
            packet = next(packets)
            audio.init(enable_input=False, enable_output=True,
                       with_opus_encoder=False, with_opus_decoder=True)
            audio.configure(output_volume=VOLUME)
            analyzer = audio.spectrum_analyzer(fft_size=512, sample_rate=48000)
            analyzer.set_fps(FPS)
            analyzer.enable_dump_output(True)
            analyzer.enable_on_pcm(2)
            player = audio_service.Player(audio, "opus", 48000, demux.frame_ms)
            session = player.open_stream(mode="replace")
            spectrum = Spectrum()
            last_frame = time.ticks_ms()
            last_progress = last_frame
            ending = False

            while True:
                audio.poll()
                state = session.state()
                if state in ("error", "canceled"):
                    raise RuntimeError("Audio session: " + state)
                if ending and state == "ended":
                    return
                # Submit at most four packets per loop; retry the current packet if the queue is full.
                for _ in range(4):
                    if ending:
                        break
                    try:
                        session.write(packet, wait=False)
                    except OSError:
                        break
                    last_progress = time.ticks_ms()
                    try:
                        packet = next(packets)
                    except StopIteration:
                        session.end()
                        ending = True
                        break

                now = time.ticks_ms()
                if time.ticks_diff(now, last_progress) > 10000:
                    raise RuntimeError("Audio playback timed out")
                if time.ticks_diff(now, last_frame) >= 1000 // FPS:
                    spectrum.draw(analyzer)
                    pyxel.render_graphics()
                    last_frame = now
                # Ignore clicks during playback instead of queueing another playback.
                mpy_button.clear()
                time.sleep_ms(2)
    finally:
        try:
            if session is not None and session.state() != "ended":
                session.cancel()
        finally:
            try:
                if analyzer is not None:
                    analyzer.disable()
                    analyzer.enable_dump_output(False)
            finally:
                audio.deinit()


def main():
    pyxel.init(start_audio=False)
    try:
        wait_for_click("Click to Start")
        while True:
            try:
                play()
            except Exception as error:
                print("Music player:", error)
            wait_for_click("Click to Restart")
    finally:
        pyxel.destroy()


if __name__ == "__main__":
    main()
