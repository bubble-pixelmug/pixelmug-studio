# Pixel Text Share

This example lets a user choose a bound PixelMug in the WebApp and send it text. After a successful device call, the Bot observes the call and posts a message in the current chat that identifies the user, device, and text.

The Bot registers two PixelMug S1 slots, and both slots accept PixelMug P1 devices. Any member of a chat can open the WebApp and see the devices bound to that chat. At least one device must be bound before text can be sent.

## Run

1. Open this directory in Studio and configure the Bot token and API URL.
2. Start the Bot. No device-side project is required.
3. In the Bubble app, send `/bind` and bind one or two PixelMug S1 or PixelMug P1 devices.
4. Send `/open` to receive the WebApp link.
5. Enter text, choose its color, size, scroll direction, and target device, then select **Send**.

After the device call succeeds, the Bot posts an operation record in the current private or group chat.

## Files

| File | Purpose |
| --- | --- |
| `bot/index.js` | Registers two device slots, observes WebApp device calls, and posts chat messages |
| `webapp/index.html` | Defines text settings and device selection |
| `webapp/src/main.js` | Loads bound devices, builds the text RPC, and calls the selected device |
| `webapp/src/style.css` | Styles the WebApp |
| `webapp/vite.config.js` | Configures relative asset URLs for Studio |

Related documentation: [Observe WebApp device calls](../../../../docs/webapp/observe-device-calls.md).
