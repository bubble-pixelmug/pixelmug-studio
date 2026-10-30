# Raw BLE Client

This example shows the lowest-level custom BLE Central flow for PixelMug. An ESP32-C3 scans for a PixelMug, connects directly to its F160 service, writes raw Simple packets to F161, and sends the values `0` through `9` once per second. The PixelMug MPY script displays the received value.

Use this project when you need to inspect or debug the F160/F161 Simple data path. For application development, use [`ble-custom-client-lib`](../ble-custom-client-lib), which provides the reusable `PixelMugBLECentral` wrapper and higher-level configuration and command APIs.

## Project structure

```text
ble-custom-client-raw/
├── package.json
├── package-lock.json
├── bot/
│   └── index.js
├── mpy/
│   ├── __main__.py
│   └── mps.json
└── custom-client-c3/
    └── ESP-IDF project
```

The `custom-client-c3` directory is the ESP-IDF Central implementation. It is intentionally kept as a direct NimBLE example and does not use the `PixelMugBLECentral` wrapper.

## Run the PixelMug MPY application

1. Start this project in Studio.
2. In the Bubble app, send `/bind` and select a PixelMug S1.
3. Send `/installMPY` to install and start the `mpy/` package.
4. Confirm that the PixelMug displays `DISC` while waiting for the C3.

The Bot uses the injected `STUDIO_MPS_ID` and `STUDIO_MPS_VERSION` values when it calls `talMpyExecOneScript`. The BLE data does not pass through the Bot or WebApp; the ESP32-C3 communicates with the PixelMug directly.

The MPY application uses open mode:

```python
ble = BleAppService("BleCustomClient")
ble.on_simple(on_number)
ble.start(auth_mode=AUTH_MODE_NONE)
```

The `on_number` callback accepts one raw byte with a value from `0` to `9`. `ble.poll()` runs from the display update callback so incoming packets update the displayed value.

## Build and flash the ESP32-C3

In a terminal configured for ESP-IDF 5.5.x:

```sh
cd tools/studio/examples/ble-custom-client-raw/custom-client-c3
idf.py set-target esp32c3
idf.py build
idf.py -p COM7 flash monitor
```

Replace `COM7` with the actual serial port. The firmware runs once, sends the ten values, disconnects, and waits for reset before repeating.

## Target selection

The C3 source filters scan results by an `MPY-` device name and the F160 service. If `TARGET_ADDRESS` is empty, it accepts only a single matching PixelMug. If several devices are nearby, set the target MAC address in `custom-client-c3/main/main.cpp` and flash the C3 again.

The MPY application prints its BLE address at startup:

```text
PixelMug BLE MAC: AA:BB:CC:DD:EE:FF
```

Use that address when selecting a target manually.

## Raw packet format

The C3 writes a seven-byte packet to F161:

```text
01 00 00 10 00 01 NN
```

The first six bytes are the Simple packet header. `NN` is the binary value from `0` to `9`; it is not the ASCII character encoding of the number. The example uses an open connection and does not perform the F150 application handshake or subscribe to response notifications.

## When to use this example

Choose this project to learn the BLE service and characteristic layout, verify raw packet framing, or diagnose a custom Central implementation. Choose `ble-custom-client-lib` when you want connection management, application handshakes, configuration transfer, command responses, and reusable host-side code.

See the [BLE device documentation](../../../../docs/ble/index.md) and [custom BLE client documentation](../../../../docs/ble/custom-client.md).
