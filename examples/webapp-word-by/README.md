# WebApp Word By

This example registers two device slots. Each slot uses a PixelMug S1 definition and accepts a PixelMug S1 or PixelMug P1. Both slots must have a bound device before the WebApp can control them.

The WebApp splits the input in two ways:

- A string without spaces is split into its first two characters.
- A string with spaces uses its first two whitespace-separated words.

Each device has independent text-size and color controls. Text is displayed statically and does not scroll.

## Run

1. Open this directory in Studio and configure the Bot token and API URL.
2. Start the Bot. No device-side project is required.
3. In the Bubble app, send `/bind` and bind one PixelMug S1 or PixelMug P1 to each slot.
4. Send `/open` to receive the WebApp link.
5. Enter two characters or two words, choose the settings for each device, and select **Display**.

## Files

| File | Purpose |
| --- | --- |
| `bot/index.js` | Registers the two device slots and handles binding and WebApp commands |
| `webapp/index.html` | Defines the input form and device controls |
| `webapp/src/main.js` | Loads bound devices, splits input, builds RPC commands, and calls both devices |
| `webapp/src/style.css` | Styles the WebApp |
| `webapp/vite.config.js` | Configures Vite to emit relative asset URLs for Studio |
