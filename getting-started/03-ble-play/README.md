# 03 · Control a PixelMug Light

Drag the phone touchpad to move a light on the cup, or tap to create sparks. This example targets PixelMug S1 Pro and Lite devices.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Enable **Automatically run device code after startup** in the run configuration and start the Agent.
4. In the Bubble App, send `/bindPixelMug` and bind a PixelMug S1 device. Wait until the light appears on the device.
5. Send `/webApp`, open the touchpad, and tap **Install MPY to device**. Wait for the installation to finish.
6. Tap **Connect to PixelMug**, then drag on the touchpad or tap it to control the light.

Studio uploads and runs the local `mpy/` directory through WebREPL. The WebApp only connects to the device over BLE and sends the interaction packets.

## Deploy to a cloud server

The project contains the required root and WebApp dependency manifests, lock files, relative Vite asset paths, and `mpy/mps.json`. During deployment Studio packages and uploads the MPY release before building the Bot and WebApp container. Select an MPS ID in the deployment page before starting deployment.

The deployment runtime injects `BOT_TOKEN`, `BOT_API_BASE_URL`, `STUDIO_WEBAPP_URL`, `STUDIO_MPS_ID`, and `STUDIO_MPS_VERSION`. The Bot passes the MPS ID and version to the WebApp URL, and the WebApp requests `talMpyExecOneScript` before connecting over BLE. The Bot does not start an HTTP server itself.

## Change the light color

Change `COLOR` in `mpy/__main__.py`, restart the Agent, wait for the device program to reload, and reconnect the WebApp over BLE.

## How it works

The Bot provides the WebApp entry point. The MPY program draws the light and receives BLE packets. The WebApp uses `BleAppClient` to send three-byte packets:

- `1` means move and `2` means tap.
- The X coordinate is in the range `0..31`.
- The Y coordinate is in the range `0..15`.
- The WebApp and MPY program share the BLE application ID `GettingStartedLight`.

The device firmware must include `micropyxel` and a `maopaoBleApp` implementation with Simple data support.

## Files

- `bot/index.js` provides the Bot commands and PixelMug S1 device declaration.
- `webapp/main.js` connects over BLE, converts touch coordinates, and sends packets.
- `webapp/package.json` and `webapp/vite.config.js` define the WebApp build.
- `mpy/__main__.py` receives packets and renders the light and sparks.
- `mpy/mps.json` describes the MPY package.
