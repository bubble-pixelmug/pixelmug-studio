# BLE Simple Motion

This example sends a PixelMug's acceleration and angular velocity to a WebApp in real time over the BLE Simple data channel.

The WebApp provides MPY installation, a Bluetooth connection button, and six live values:

- `ax`, `ay`, `az`: three-axis acceleration in `g`
- `gx`, `gy`, `gz`: three-axis angular velocity in `°/s`

## Data format

The device reads the G-sensor every 40 ms and sends a 24-byte packet with `send_simple_raw()`. The packet contains six little-endian `float32` values:

| Byte offset | Data | Unit |
| --- | --- | --- |
| 0 | `ax` | `g` |
| 4 | `ay` | `g` |
| 8 | `az` | `g` |
| 12 | `gx` | `°/s` |
| 16 | `gy` | `°/s` |
| 20 | `gz` | `°/s` |

The device encodes the six values as RAW data:

```python
packet = struct.pack("<6f", ax, ay, az, gx, gy, gz)
ble.send_simple_raw(packet)
```

The WebApp receives the data through `simpleData` and parses the values in the same order:

```js
ble.on('simpleData', (data) => {
  if (data.dataType !== 0 || data.bytes.byteLength !== 24) return

  const view = new DataView(
    data.bytes.buffer,
    data.bytes.byteOffset,
    data.bytes.byteLength,
  )

  const ax = view.getFloat32(0, true)
  const ay = view.getFloat32(4, true)
  const az = view.getFloat32(8, true)
  const gx = view.getFloat32(12, true)
  const gy = view.getFloat32(16, true)
  const gz = view.getFloat32(20, true)
})
```

`true` selects little-endian decoding, matching the device-side `<6f`. Motion data is real time; if the send queue is busy, this example drops the current sample instead of retransmitting stale data later.

## Run

1. Start the project in Studio and run the Bot and WebApp.
2. In the Bubble app, bind a PixelMug and open the WebApp.
3. Select **Install MPY** and wait for the installation to start.
4. Select **Connect Bluetooth**, then move the PixelMug to watch all six values change.

The WebApp receives the MPS ID and version from the Bot URL and calls `talMpyExecOneScript` before connecting over Bluetooth. The PixelMug display shows `WAIT` while the sensor initializes, `DISC` when Bluetooth is disconnected, and `CONN` after Bluetooth connects.
