# Word By Bot

This example uses two device slots. Each slot is configured for a PixelMug S1 and is compatible with a PixelMug P1.

Send `/bind` and follow the app instructions to bind one mug to each slot. After both devices are bound, send text to display two parts at the same time:

- `hello` displays `h` on the first mug and `e` on the second mug.
- `hello world` displays `hello` on the first mug and `world` on the second mug.

Inputs containing spaces are split into words. Inputs without spaces are split into Unicode characters; only the first two parts are used.

The bot reads its configuration from the `BOT_TOKEN` and optional `BOT_API_BASE_URL` environment variables.
