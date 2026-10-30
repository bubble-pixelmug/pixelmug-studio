# Media Messages Bot

This example sends image, voice, video, and GIF messages using local files in `bot/assets`.

After starting the example in Studio, send one of these commands:

- `/image` sends `bot/assets/photo.png`.
- `/voice` sends `bot/assets/iphone.ogg`.
- `/video` sends `bot/assets/pixelmug.mp4` with `bot/assets/cover.png` as its thumbnail.
- `/gif` sends `bot/assets/game.gif`.

The bot also reports basic metadata when it receives image, voice, video, or GIF messages. It reads its configuration from the `BOT_TOKEN` and optional `BOT_API_BASE_URL` environment variables.
