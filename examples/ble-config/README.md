# BLE Configuration Uploader

A complete Bot, WebApp, and MPY example. It uploads five JSON data types over BLE and displays them on a PixelMug one at a time.

| Field | Type | Default value | MPY type |
| --- | --- | --- | --- |
| config1 | number | `42` | `int` / `float` |
| config2 | string | `"hello"` | `str` |
| config3 | boolean | `true` | `bool` |
| config4 | array | `[1, 2, 3]` | `list` |
| config5 | object | `{"x": 1, "y": 2}` | `dict` |

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Enable **Automatically run device code after startup** and start the Agent.
4. In the Bubble App, send `/bindPixelMug` and bind a PixelMug S1 Pro or Lite. Wait for `WAIT` on the cup.
5. Send `/webApp`, open the uploader, and click **Install MPY to device**. Wait for installation to finish.
6. Click **Connect to PixelMug**, then send the default configuration or edit the fields first.

Studio uploads and runs the local `mpy/` directory through WebREPL. The WebApp connects to the device over BLE and sends the configuration packets.

## Deploy to a cloud server

The project includes root and WebApp dependency manifests, lock files, relative Vite assets, and `mpy/mps.json`. During deployment Studio packages and uploads the MPY release before building the Bot and WebApp container. Select an MPS ID on the deployment page before starting deployment.

The deployment runtime injects `BOT_TOKEN`, `BOT_API_BASE_URL`, `STUDIO_WEBAPP_URL`, `STUDIO_MPS_ID`, and `STUDIO_MPS_VERSION`. The Bot adds the MPS ID and version to the WebApp URL. The WebApp calls `talMpyExecOneScript` before connecting over BLE.

## Data format

The WebApp sends one `settings` configuration:

```js
await client.setConfig('settings', {
  config1: 42,
  config2: 'hello',
  config3: true,
  config4: [1, 2, 3],
  config5: { x: 1, y: 2 },
});
```

The MPY program registers the same configuration name and validates every field before replacing the current display. A successful callback emits `configApplied`; a validation failure emits `configError`. The main loop calls `ble.process_pending_config(max_items=1)` to apply one complete configuration.

The built-in font displays ASCII only, so use English or pinyin in string values and object keys. Configuration values are kept in memory and the temporary upload file is removed after the callback completes.

## Files

- `bot/index.js` provides the Bot commands, device binding, and WebApp URL.
- `webapp/main.js` installs MPY, connects over BLE, validates form data, and uploads configuration.
- `webapp/package.json` and `webapp/vite.config.js` define the WebApp build.
- `mpy/__main__.py` receives configuration data and renders it.
- `mpy/display.py` scrolls each line across the display.
- `mpy/mps.json` describes the MPY package.
