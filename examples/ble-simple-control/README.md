# BLE Simple Control

This example uses the BLE Simple data channel to send coordinates from a WebApp touch grid to a PixelMug in real time.

The WebApp displays a 32 × 16 grid. The top-left coordinate is `(0,0)` and the bottom-right coordinate is `(31,15)`. Touching or dragging updates the coordinate above the grid and sends two bytes:

```js
await ble.sendSimpleRaw(new Uint8Array([x, y]));
```

The PixelMug receives the coordinate with `on_simple()`:

```python
def receive_coordinate(data_type, payload, context):
    if data_type == DATA_TYPE_RAW and len(payload) == 2:
        x = payload[0]
        y = payload[1]

ble.on_simple(receive_coordinate)
```

## Run

1. Start the project in Studio and run the `mpy` device code.
2. In the Bot chat, use `/bindPixelMug` to bind a device.
3. Use `/webApp` to open the page.
4. Select **Install MPY** and wait for the installation to start.
5. Select **Connect Bluetooth**, then touch or drag on the grid.

The WebApp receives the MPS ID and version from the Bot URL and calls `talMpyExecOneScript` before connecting over Bluetooth. The PixelMug shows `DISC` before connecting, `CONN` after connecting, and `(x,y)` for each received coordinate.
