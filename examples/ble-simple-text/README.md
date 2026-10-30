# BLE Simple Text

This example uses the BLE Simple data channel to send lowercase letters from a WebApp virtual keyboard to a PixelMug.

The WebApp displays 26 lowercase letters. Each key sends its letter immediately with `sendSimpleText()`:

```js
await ble.sendSimpleText(letter);
```

The PixelMug receives the data with `on_simple()` and decodes it using `DATA_TYPE_TEXT`. The display shows up to six letters from left to right; receiving a seventh letter clears the display and starts again with that letter:

```python
from maopaoBleApp import DATA_TYPE_TEXT

def receive_text(data_type, payload, context):
    if data_type == DATA_TYPE_TEXT:
        letter = payload.decode("utf-8")

ble.on_simple(receive_text)
```

## Run

1. Start this project in Studio and run the `mpy` device code.
2. In the Bot chat, use `/bindPixelMug` to bind a device.
3. Use `/webApp` to open the page.
4. Select **Install MPY** and wait for the installation to start.
5. Select **Connect Bluetooth**, then tap the letter keys.

Before connecting, the PixelMug shows `DISC`. After connecting it shows `CONN`, then displays each received letter.

The WebApp receives the MPS ID and version from the Bot URL and calls `talMpyExecOneScript` to install the project before opening the BLE connection.
