# 04 · More MPY Examples

This project uses one Bot to run several independent MPY examples on PixelMug S1 Pro and Lite devices. It does not use a WebApp and does not support P1 devices.

## Project layout

```text
04-more-mpy/
├─ bot/index.js             Bot commands and manual MPY installation
├─ exampleMPY/              Independent MPY examples
│  ├─ bitCoin/              BTC/USD price example
│  ├─ rotateImage/          PNG rotation example with an image asset
│  ├─ musicPlayer/          Local music playback and spectrum example
│  └─ motion/               Motion-driven particle column example
├─ mpy/                     The example currently selected to run
└─ package.json
```

Studio runs only the files in `mpy/`. The example folders are source templates and are not uploaded together.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Leave **Automatically run device code after startup** disabled. This example starts MPY from the Bot command.
4. Start the Agent, then send `/bindPixelMug` to the Bot and bind an online PixelMug S1.
5. Send `/installMPY`. The Bot calls `talMpyExecOneScript`; Studio intercepts it and copies the current `mpy/` directory through WebREPL.
6. The Bot reports the final device result after receiving `MPS_IS_RUNNING`, an installation failure, a runtime failure, or a timeout.

## Deploy to a cloud server

The root `package.json` declares `@jeejio-bubble/bot@0.1.9`, and the root `package-lock.json` is required for deployment. The deployment service packages the current `mpy/` directory and uploads it to the selected MPS ID before building the Bot container.

The runtime injects:

```text
BOT_TOKEN
BOT_API_BASE_URL
STUDIO_MPS_ID
STUDIO_MPS_VERSION
```

The Bot passes the injected MPS ID and version to `talMpyExecOneScript`. In Studio, the ID is a local placeholder and the call is intercepted; in the cloud, the real ID and version identify the uploaded MPS package.

## Select another example

1. Stop the Agent.
2. Clear the existing files in `mpy/`.
3. Copy every file and subdirectory from the selected example into `mpy/`. The entry point must be `mpy/__main__.py`.
4. Start the Agent and send `/installMPY`.

Always copy the example's `mps.json` and required assets together with its Python files.

## Default bitCoin example

The default `mpy/` contains the BTC/USD WebSocket example. It connects to Kraken, subscribes to the latest trades, and displays the price on the device. The device needs network access, a correct system clock, `micropyxel`, and `mps_websocket`.

The example does not reconnect automatically. Send `/installMPY` again after a network failure or timeout.

## Other examples

`rotateImage` rotates a 16×16 PNG tile and requires `asset.png`.

`musicPlayer` plays the bundled Ogg Opus file and displays a spectrum. Copy `__main__.py`, `ogg.py`, `spectrum.py`, `mps.json`, and `test_audio.ogg` together. The firmware must provide `audio_service`, `micropyxel`, and `mpy_button`.

`motion` uses the G-sensor to animate a particle column and requires `micropyxel`, `pixel_dust`, `g_sensor`, and `mpy_button`.
