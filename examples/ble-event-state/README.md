# BLE State and Events

A complete Bot, WebApp, and MPY teaching project for PixelMug S1 Pro and Lite devices. The MPY program starts at 0, increments about once per second, and returns to 0 after 99. The mug and WebApp show the same counter, while the page also keeps the latest event.

## Run

1. Open this directory in Studio, select `bot/index.js`, and configure the Bot token.
2. Enable automatic device code startup and start the Agent.
3. In the Bubble app, send `/bindPixelMug` and bind a PixelMug.
4. Send `/webApp`, select **Install MPY**, then select **Connect**.
5. Watch the count update every second. Select **Read current value** to request a snapshot.
6. At 10, 20, and other multiples of ten, the event area shows a notification; after 99, it shows the counter reset event.

The WebApp receives the MPS ID and version from the Bot URL and calls `talMpyExecOneScript` before connecting over Bluetooth. Both sides use the `BleEventState` application ID.

## Key APIs

| Purpose | MPY | WebApp |
| --- | --- | --- |
| Define readable state | `ble.set_state_provider(read_state)` returns `{"count": count}` | `await client.requestSnapshot()` returns `{ count: currentValue }` |
| Publish state | `ble.publish_state()` | `client.on('state', showCount)` |
| Multiple-of-ten event | `ble.send_event("multipleOfTen", {"count": count})` | Check `event.event` and read `event.count` in `client.on('event', ...)` |
| Counter reset event | `ble.send_event("counterReset", {"count": 0})` | Handle `counterReset` in the same event listener |

State represents the current value, while an event represents something that just happened. At 20, the device publishes `{"count": 20}` and sends one `multipleOfTen` event; at 21, it only publishes state and the event area keeps the previous notification.

Zero triggers only the reset event, not the multiple-of-ten event. Startup does not emit a reset event; the first reset occurs after a complete counting cycle.

## Connection and data behavior

Counting does not depend on the WebApp connection and continues while disconnected. MPY publishes state and events only when `ble.ready`, and calls `ble.poll()` during each frame update.

The WebApp registers listeners before connecting and requests the current state after connecting, so the first value may be 7 or 15 instead of 0. `requestSnapshot()` only reads the value and does not reset the counter. Events that occur while disconnected are not replayed, but reconnecting still provides the current count.

This example only covers connection, state reads, and event notifications. It does not add app commands or a disconnect flow; see [ble-minimal](../ble-minimal/README.md) for an active disconnect. `client.close()` cleans up page listeners but does not guarantee a physical BLE disconnect.

State and events use the standard message channel and do not wait for per-message WebApp acknowledgements. State displays the latest value and is not a history of every count.

## Files

- `mpy/__main__.py`: Counts, defines state, publishes state and events, and draws the value.
- `webapp/src/main.js`: Installs MPY, connects, reads state, and listens for state and events.
- `webapp/index.html` and `webapp/src/style.css`: Define the install, connection, snapshot, count, and event controls.
- `bot/index.js`: Handles device binding, help, and the WebApp entry.

## Related documentation

- [WebApp SDK BLE API](../../../../docs/ble/app/webapp.md)
- [MPY state and events](../../../../docs/ble/app/mpy/state-events.md)

This example uses the built-in `maopaoBleApp`; `mps.json` declares only the MicroPyxel display dependency.
