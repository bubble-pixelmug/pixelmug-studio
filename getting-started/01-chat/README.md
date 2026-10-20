# 01 Chat with PixelMug

This is a minimal bot-only PixelMug application. Send a message to the bot and it displays the text on a bound PixelMug device, then replies with a confirmation.

## Run in Studio

1. Open this project folder in Studio.
2. Select `bot/index.js` as the bot entry point.
3. Select one of your online PixelMug devices in the device panel.
4. Start the agent and open a private chat with the selected bot in Bubble App.
5. Send `/bindPixelMug`, choose a device, and then send any text message.

Studio injects the selected bot credentials into `BOT_TOKEN` and `BOT_API_BASE_URL`. The project does not contain credentials.

## Deploy to the cloud

The same project can be deployed without code changes. The deployment service injects the same `BOT_TOKEN` and `BOT_API_BASE_URL` variables into the container, so local Studio runs and cloud runs use the same application configuration.

## Change the display color

Open `bot/index.js` and change `color: '#00ff00'` in the `talPrintText` call. Restart the agent or redeploy the project to apply the change.

## What happens

The bot registers a PixelMug device adapter, handles text messages, asks the user to bind a device when needed, sends a display RPC to the device, and reports the result back to the chat.
