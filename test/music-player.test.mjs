import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('local music player parses the asset, drains audio, renders spectrum and restarts on click', () => {
  const script = String.raw`
import os, runpy, sys, time, types
os.chdir(sys.argv[1])
sys.path.insert(0, os.getcwd())
clock = [0]
time.ticks_ms = lambda: clock[0]
time.ticks_diff = lambda a, b: a-b
time.sleep_ms = lambda ms: clock.__setitem__(0, clock[0]+ms)
texts, rects, lifecycle = [], [], []
pixels = []
pyxel = types.ModuleType("micropyxel")
pyxel.init = lambda **kw: None
pyxel.destroy = lambda: lifecycle.append("display closed")
pyxel.cls = lambda color: None
pyxel.text = lambda x,y,text,color: texts.append(text)
pyxel.render_graphics = lambda: None
pyxel.set_palette = lambda colors: None
pyxel.rect = lambda *args: rects.append(args)
pyxel.pset = lambda *args: pixels.append(args)
sys.modules["micropyxel"] = pyxel
button = types.ModuleType("mpy_button")
button.clear = lambda: None
button.get = lambda: "click"
sys.modules["mpy_button"] = button
from ogg import OggOpusStreamDemuxer
demux = OggOpusStreamDemuxer()
expected = []
with open("test_audio.ogg","rb") as f:
    while True:
        chunk = f.read(1024)
        if not chunk: break
        expected.extend(demux.feed(chunk))
        assert not demux.error, demux.error
assert demux.validated and demux.seen_eos and len(expected) > 0
assert not demux.partial and not demux.buf
sessions = []
class Analyzer:
    def set_fps(self, fps): assert fps == 24
    def enable_dump_output(self, enabled): pass
    def enable_on_pcm(self, channel): assert channel == 2
    def disable(self): lifecycle.append("analyzer closed")
    def get_bands_u8_into(self, bands, height, noise, amplitude):
        bands[:] = bytes([8]*16)
        return 16
class Session:
    def __init__(self):
        self.packets, self.ending, self.drain_polls = [], False, 0
        self.blocked = False
        sessions.append(self)
    def write(self, packet, wait):
        assert wait is False
        if not self.blocked:
            self.blocked = True
            raise OSError(11)
        self.blocked = False
        self.packets.append(packet)
    def end(self): self.ending = True
    def state(self):
        if self.ending:
            self.drain_polls += 1
            if self.drain_polls >= 5: return "ended"
        return "playing"
    def cancel(self): lifecycle.append("canceled")
class Audio:
    def init(self, **kw): assert kw["with_opus_decoder"] is True
    def configure(self, **kw): pass
    def spectrum_analyzer(self, **kw): return Analyzer()
    def poll(self): clock[0] += 2
    def deinit(self): lifecycle.append("audio closed")
class Player:
    def __init__(self, audio, codec, rate, frame):
        assert (codec,rate,frame) == ("opus",48000,demux.frame_ms)
    def open_stream(self, mode):
        assert mode == "replace"
        return Session()
service = types.ModuleType("audio_service")
service.audio, service.Player = Audio(), Player
sys.modules["audio_service"] = service
app = runpy.run_path("__main__.py", run_name="test")
for _ in range(2):
    app["play"]()
    assert sessions[-1].packets == expected
    assert sessions[-1].drain_polls >= 5
assert rects
assert lifecycle.count("audio closed") == 2
# Prompt waits for a real click rather than automatically starting.
clicks = iter([None] * 11 + ["click"])
button.get = lambda: next(clicks)
app["wait_for_click"]("Click to Start")
assert texts[-1] == "Click to Start"
assert pixels[:3] == [(15,14,8),(17,14,8),(16,15,8)]
assert pixels[9:12] == [(15,13,8),(17,13,8),(16,14,8)]
assert pixels[18:21] == pixels[:3]
# Main requests Start once, then Restart after each completed playback.
prompts, plays = [], []
class StopDemo(Exception): pass
def wait(message):
    prompts.append(message)
    if len(prompts) == 3: raise StopDemo()
app["main"].__globals__["wait_for_click"] = wait
app["main"].__globals__["play"] = lambda: plays.append(True)
try: app["main"]()
except StopDemo: pass
assert prompts == ["Click to Start", "Click to Restart", "Click to Restart"]
assert len(plays) == 2
assert lifecycle[-1] == "display closed"
print("Opus packets:", len(expected), "frame ms:", demux.frame_ms)
`;
  const directory = fileURLToPath(new URL('../getting-started/04-more-mpy/exampleMPY/musicPlayer/', import.meta.url));
  const result = spawnSync('python', ['-B', '-c', script, directory], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
