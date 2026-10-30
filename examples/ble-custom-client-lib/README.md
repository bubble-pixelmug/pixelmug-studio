# Open BLE: Button-Controlled Circles

This example shows how an ESP32-C3 can configure and control a PixelMug through `PixelMugBLECentral`. After the C3 establishes an application session with the PixelMug, it uploads the circle color, radius step, and cycle length. Once the PixelMug applies the configuration, it displays `CONFIG DONE`. Each press of the button connected to GPIO9 then sends a `nextCircle` command, and the mug draws the next hollow circle.

The default configuration uses color `10`, radius step `1`, and a six-step cycle. The button therefore selects radii in this sequence:

```text
2 → 3 → 4 → 5 → 6 → 7 → 2 → …
```

The flow demonstrates two interfaces: configuration transfer sends a group of parameters before operation, while control commands handle an immediate action for each button press.

## Files

```text
ble-custom-client-lib/
├── bot/
│   └── index.js
├── mpy/
│   ├── __main__.py       Receives configuration and draws hollow circles
│   └── mps.json
└── custom-client-c3/
    ├── BLECentral/
    │   ├── PixelMugBLECentral.h
    │   └── PixelMugBLECentral.cpp
    ├── CMakeLists.txt
    ├── sdkconfig.defaults
    └── main/
        ├── CMakeLists.txt
        ├── idf_component.yml
        └── main.cpp      Uploads configuration and controls the GPIO9 button
```

The C3 project uses ESP-IDF 5.5.x and esp-nimble-cpp 2.5.0. `idf_component.yml` downloads esp-nimble-cpp on the first build.

## Hardware connection

Connect the button between GPIO9 and GND. The program enables GPIO9's internal pull-up:

```text
GPIO9 ── button ── GND
```

GPIO9 reads low while the button is pressed. GPIO9 is also a common ESP32-C3 boot configuration pin; do not hold the button during reset or power-up, or the board may enter download mode.

## 1. Run the PixelMug application

Start this project in Studio. In the Bubble app, send `/bind` and bind a PixelMug. Use `/installMPY` to install and start the current `mpy/` package. The Bot sends the injected MPS ID and version through `talMpyExecOneScript`.

The application uses open connection mode and prints the BLE MAC address to the serial console:

```text
PixelMug BLE MAC: AA:BB:CC:DD:EE:FF
```

If several PixelMugs are nearby, put this address in `custom-client-c3/main/main.cpp` as `TARGET_ADDRESS`. Omitting the address is safe only when exactly one matching PixelMug is within scan range.

## 2. Configure circle parameters

After the C3 connects and completes the hello handshake, it calls:

```cpp
mug.setConfigJson(
    "circle",
    R"({"color":10,"step":1,"steps":6})"
);
```

The configuration fields are:

| Field | Meaning |
| --- | --- |
| `color` | MicroPyxel color value from 0 to 15 |
| `step` | Radius increase after each button press |
| `steps` | Number of circles in one cycle |

The radius starts at 2. The configuration must satisfy `2 + step × (steps - 1) <= 7` so every circle fits on the 32 × 16 display.

Successful `setConfigJson()` only means that the configuration was submitted. The C3 waits for the `configApplied` event. The MPY configuration handler validates the fields, prints the received configuration, and displays:

```text
CONFIG
DONE
```

## 3. Send the control command

After configuration succeeds, the C3 polls GPIO9. When it detects a debounced high-to-low transition, it sends:

```cpp
mug.command("nextCircle", "{}");
```

`nextCircle` does not resend the color, step, or cycle length. MPY uses the applied configuration to calculate the current radius, draw the hollow circle, and return the current radius, color, and next radius. After the configured number of steps, the next press starts again at radius 2.

The C3 performs simple debounce handling for both press and release. A long press triggers one command and must be released before the next circle can be drawn.

## 4. Build and flash the C3

In a terminal configured for ESP-IDF 5.5.x:

```sh
cd tools/studio/examples/ble-custom-client-lib/custom-client-c3
idf.py set-target esp32c3
idf.py build
idf.py -p COM7 flash monitor
```

Replace `COM7` with the actual device port. During testing, disconnect the Bubble app and any other BLE central from the target PixelMug, then reset the C3. Once configuration completes, press the GPIO9 button.

## PixelMugBLECentral

`BLECentral/PixelMugBLECentral.h` and `.cpp` wrap scanning and connection, MTU negotiation, service discovery, notification subscription, hello/session setup, command responses, configuration chunking, and Simple packets. The implementation targets ESP-IDF and esp-nimble-cpp and can also serve as a porting reference for Arduino, desktop, or mobile BLE hosts.

See the [custom BLE host documentation](../../../../docs/ble/custom-client.md) for protocol and porting details.

## ESP-IDF 5.5 notification configuration

ESP-IDF 5.5's NimBLE places the ATT notification receive path behind the GATT Server build condition. Even though the application acts only as a Central, keep these options enabled:

```ini
CONFIG_BT_NIMBLE_ROLE_PERIPHERAL=y
CONFIG_BT_NIMBLE_ROLE_BROADCASTER=y
CONFIG_BT_NIMBLE_GATT_SERVER=y
```

These options provide compile-time support and do not start advertising or change the example's Central behavior. Disabling them can allow connection, reads, writes, and subscriptions to succeed while hello responses never arrive. The example keeps these options in `sdkconfig.defaults`; existing projects must also check `sdkconfig`, because changing defaults does not override an existing configuration.

esp-nimble-cpp 2.5.0 has a conditional compilation inconsistency when Peripheral is enabled and Broadcaster is disabled, causing `m_advertiseOnDisconnect` to be undefined. Broadcaster support is therefore also kept enabled; advertising starts only when an advertising API is called explicitly.
