# WebApp Device Events

This example loads the PixelMug S1 bound to the current chat, subscribes or unsubscribes to device events, and displays charging state changes. When the bound device changes, the page updates its target device and automatically resubscribes if it was already subscribed.

## Run

1. Open this directory in Studio and configure the Bot token and API URL.
2. Start the Bot. No device-side project is required.
3. In the Bubble app, send `/bind` and bind a PixelMug S1.
4. Send `/open` to open the WebApp.
5. Select **Subscribe**, then connect or disconnect the charging cable.
6. Select **Unsubscribe** to stop receiving new charging events.

Keep the page open and bind a different device to verify `onDevicesChanged()`.

## Files

| File | Purpose |
| --- | --- |
| `bot/index.js` | Registers a PixelMug S1 and provides binding and WebApp entry points |
| `webapp/index.html` | Defines device, subscription, and charging status controls |
| `webapp/src/main.js` | Loads the device, manages subscriptions, and parses charging events |
| `webapp/src/style.css` | Styles the WebApp |
| `webapp/vite.config.js` | Configures relative asset URLs for Studio |

Related documentation: [Receive device events](../../../../docs/webapp/device-events.md).
