# WebApp Device RPC

Bind a PixelMug S1 or PixelMug P1 in the Bot chat, then open the WebApp from that chat. The page loads the bound device and uses `callDevice()` to send a `talSetDisplayOnOff` RPC that turns the display on or off.

## Run

1. Open this directory in Studio and configure the Bot token and API URL.
2. Start the Bot. No device-side project is required.
3. In the Bubble app, send `/bind` and bind a PixelMug S1 or PixelMug P1.
4. Send `/open` and select the button in the message to open the WebApp.
5. Select **Turn on display** or **Turn off display**.

The Bot registers a PixelMug S1 slot and accepts PixelMug P1 through `compatible = ['PixelMug']`. Both models support `talSetDisplayOnOff`, so the WebApp can use the same RPC for either device.

## Files

| File | Purpose |
| --- | --- |
| `bot/index.js` | Registers the compatible device and provides binding and WebApp entry points |
| `webapp/index.html` | Defines the display control buttons |
| `webapp/src/main.js` | Builds the display RPC and calls the bound device |
| `webapp/src/style.css` | Styles the WebApp |
| `webapp/vite.config.js` | Configures relative asset URLs for Studio |

Related documentation: [Quick start](../../../../docs/webapp/quick-start.md).
