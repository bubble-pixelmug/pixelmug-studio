# MicroPython tutorial examples

Open this directory in PixelMug Studio, configure the Bot, and bind a PixelMug S1. The `bot/` directory provides `/help`, `/bindPixelMug`, and `/installMPY`. The `mpy/` directory contains the program currently installed on the device, and `examples/` contains independent examples.

To try an example, stop the running device program, clear the previous files from `mpy/`, and copy every file from the selected `examples/<example>/` directory into `mpy/`. Keep any assets required by the example, such as audio files, PNG files, or font files. Start the agent with automatic device-code startup enabled, or send `/installMPY` to install the code manually while the agent is running.

Each example has its own `mps.json`. Copy it together with `__main__.py` and any other files so the MPY package metadata and dependencies match the code. The network host examples have additional instructions in their host directories.

| Example | What it demonstrates |
| --- | --- |
| `audio-input-spectrum` | Captures microphone input for ten seconds, displays a 16-band input spectrum, and then exits. It reads and discards recording frames so the capture queue does not block. |
| `audio-ogg-player` | Reads `test_audio.ogg` in chunks, demultiplexes Ogg Opus packets with `ogg.py`, and streams them to the Audio Service player. |
| `audio-opus-record` | Records about three seconds of Opus packets through `record_frame` events, then streams the received packets back. |
| `audio-output-spectrum` | Generates 16 PCM test tones, plays each band for one second, and displays the actual output spectrum with a 4096-point FFT. |
| `audio-pcm-record` | Records about three seconds of raw 16 kHz mono PCM to `recording.pcm`, expands each sample three times to 48 kHz, and plays the result in one submission. |
| `audio-pcm-tone` | Generates and plays a half-second, 440 Hz, 48 kHz mono PCM notification tone. |
| `audio-playback-control` | Demonstrates normal playback completion, replacing an active Ogg Opus stream, manually stopping playback, and handling `play_end` events. |
| `audio-vad` | Listens for voice-activity state changes, prints speech and silence notifications, and discards recording data. |
| `audio-wav-player` | Locates the `fmt` and `data` chunks in `audio.wav`, validates a 48 kHz mono 16-bit PCM WAV file, and streams the audio in 20 ms chunks. |
| `dust-motion-sand` | Uses G-sensor acceleration as a two-dimensional force so Dust particles flow when the mug is tilted. |
| `dust-particle-control` | Uses the bottom touch button to launch Dust particles from the left and demonstrates collisions with two obstacles. |
| `dust-sand` | Runs a basic Dust simulation in which a row of particles falls under gravity and bounces at the bottom. |
| `motion-axis-calibration` | Guides six straight-line mug movements—up, down, forward, backward, left, and right—and maps them to the G-sensor X, Y, and Z axes by checking opposite directions. |
| `motion-gyro` | Shows X, Y, and Z angular velocity on separate pages as signed bars; click the bottom touch area to change pages. |
| `motion-show-axis` | Uses G-sensor acceleration and inertial filtering to move and resize a filled circle in response to mug translation. |
| `motion-tap-counter` | Counts G-sensor `EVENT_TAP` callbacks when the mug is placed down and plays an expanding ring animation for each tap. |
| `motion-tilt-level` | Uses the X/Y gravity projection from `get_accel()` to move a bubble around a tilt-level display. |
| `network-http-download` | Streams a 64 KiB HTTPS response into `download.bin` with a fixed 1 KiB buffer and verifies the received size. |
| `network-http-json` | Requests the current Chicago temperature from Open-Meteo over HTTPS, parses JSON, and refreshes every 15 minutes with a 30-second retry interval after failures. |
| `network-tcp-client` | Resolves `example.com`, opens a raw TCP connection on port 80, sends an HTTP/1.0 request, and parses the response status line. |
| `network-udp-cast` | Receives a palette and packed 32×16 frame packets over UDP and renders them on PixelMug. The companion host in `host-effect-caster/` generates five effects—Fire, Digital Rain, Plasma, Aurora, and Ripple; run `npm install` and `npm start` there, then set the device IP and UDP port in the host UI. |
| `network-udp-motion` | Sends fused G-sensor quaternions over UDP about every 40 ms. The companion `host-3D-viewer/` displays the mug rotation in a Three.js viewer; install its dependencies and run `npm start` before sending device packets. |
| `network-wss-btc` | Connects to Kraken's public WebSocket market-data endpoint, subscribes to the BTC/USD ticker, displays the latest price, and reconnects with exponential backoff after disconnection. |
| `prompt-sound` | Uses the touch button to create and pop a rising bubble while playing interruptible Ogg Opus prompt sounds. The example includes the `bubble-create.ogg` and `bubble-pop.ogg` assets. |
| `upyxel-animation` | Runs a beginner `update`/`draw` loop with a white ball that moves and bounces off the screen edges, then exits after about 15 seconds. |
| `upyxel-channel` | Compares MicroPyxel channel gain and pitch detune in separate phases with a two-second silent gap. |
| `upyxel-colors` | Shows four pages covering the default palette, custom RGB colors, palette-index remapping, and ordered dithering. |
| `upyxel-draw-state` | Demonstrates a moving pattern inside a clipping window, then a camera that follows a ball through a larger scene. |
| `upyxel-events` | Uses the PixelMug touch button to pause and resume a continuously running counter through application events and shared state. |
| `upyxel-font` | Loads a BDF font and scrolls greetings in Latin, Chinese, Japanese, and Korean while exercising text measurement and centering. |
| `upyxel-image` | Loads `canvas.png`, extracts 9×9 animal sprites, and displays three sprites per page across four pages. |
| `upyxel-image-transform` | Displays a dolphin image while cycling through horizontal and vertical flips, 0.5×/1×/1.5× scaling, and clockwise rotation. |
| `upyxel-manual-render` | Moves a pixel from left to right while manually clearing and submitting each frame, repeating the animation five times. |
| `upyxel-music` | Combines four MML parts into a `Music`, plays them together for 60 seconds, and shows channel activity on the display. |
| `upyxel-shapes` | Presents pixels, lines, rectangles, circles, ellipses, triangles, outlines, and region filling over three repeating pages. |
| `upyxel-sound` | Exercises MicroPyxel sound resources, playback positions, looping, resuming, and channel stop control in several phases. |
| `upyxel-sprite-animation` | Loads three bird sprites from `canvas.png` and cycles them while Audio Service VAD detects speech; it holds the current frame during silence. |
| `upyxel-text` | Shows static text with the built-in font, then scrolls `PIXELMUG STUDIO` from right to left. |
| `upyxel-tone` | Compares custom wavetables, sample bit depth, gain, and short/long noise modes in separate tone-test phases. |

The source comments at the top of each example document the APIs and constraints used by that example. The existing contents of `mpy/` can be replaced using the process above.
