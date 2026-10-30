# Minimal BLE

A complete Bot, WebApp, and MPY teaching project based on the minimal BLE example. It targets PixelMug S1 Pro and Lite devices.

## Run

1. Open this directory in Studio, select `bot/index.js` as the Bot entry, and configure the token.
2. Enable automatic device code startup and start the Agent.
3. In the Bubble app, send `/bindPixelMug` and bind a PixelMug.
4. Wait for `DISC` on the mug, then send `/webApp`.
5. Select **Install MPY**, then **Connect**. The mug shows `CONN`.
6. Select **Echo** to display `echo`.
7. Select **Disconnect**, wait for `DISC`, then select **Reconnect** to show `CONN` again.

The WebApp receives the MPS ID and version from the Bot URL and calls `talMpyExecOneScript` before connecting over Bluetooth. Keep the phone near the PixelMug and grant Bluetooth permission when prompted.

## Files and APIs

| File | Purpose |
| --- | --- |
| `bot/index.js` | Handles binding, help, and WebApp commands |
| `webapp/src/main.js` | Installs MPY and calls `getDevices`, `connect`, `reconnect`, and `command` |
| `webapp/index.html` and `webapp/src/style.css` | Define the install, connect, disconnect, reconnect, and echo controls |
| `mpy/__main__.py` | Registers BLE callbacks and commands, polls the service, disconnects, and draws with MicroPyxel |
| `mpy/mps.json` | Declares the MicroPyxel dependency |

Both sides use the `BleMinimal` application ID. The device uses Bubble authentication, while the WebApp SDK and native bridge handle the connection, authentication, and F150 encryption.

The `echo` callback returns `{"text":"echo"}`. This page sends the command without displaying the response. To read it, use `const response = await ble.command("echo", { text: "echo" })` and access `response.result.text`.

## Disconnect and reconnect

The device registers a `disconnect` command. It sends the command response first, waits 200 ms in the main loop, and then calls `BleAppService.disconnect()` to terminate the physical connection. The page controls the sequence; use the mug display to verify `DISC`, `CONN`, and `echo`.

The firmware must include `BleAppService.disconnect()`. Uploading MPY through Studio does not update built-in firmware modules. The disconnect response may be lost when the link closes, so use `DISC` on the mug as confirmation.

`Reconnect` calls the SDK `reconnect()` method after a previous connection. Follow the **Disconnect → wait for DISC → Reconnect** sequence. Closing the page only cleans up page resources and does not guarantee an immediate physical disconnect.

## Related documentation

- [BLE introduction](../../../../docs/ble/index.md)
- [Connection and lifecycle](../../../../docs/ble/app/mpy/connection.md)
- [Commands and responses](../../../../docs/ble/app/mpy/commands.md)
