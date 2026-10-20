# 02 Control PixelMug Text with a WebApp

This project combines a Bubble Bot with a browser WebApp. The bot provides the entry point and device declaration; the WebApp lets users configure text, color, size, direction, and speed before sending the display command to a bound PixelMug.

## Run in Studio

1. Open this project folder in Studio.
2. Select `bot/index.js` as the bot entry point.
3. Choose a WebApp address that your phone can reach on the same local network.
4. Start the agent and bind an online PixelMug device.
5. Open a private chat with the selected bot, send `/bindPixelMug`, then send `/webApp` and open the controller.
6. Configure the text and display options, then send the text to PixelMug.

Studio injects `BOT_TOKEN`, `BOT_API_BASE_URL`, and `STUDIO_WEBAPP_URL` at runtime. No credentials or local URLs are stored in the project.

## Deploy to the cloud

The same project can be deployed without code changes. The cloud deployment injects the same Bot API variables and generates `STUDIO_WEBAPP_URL` for the public WebApp address.

## Change the default text

Open `webapp/index.html` and change the value of the text input. Restart the Studio agent or redeploy the project to apply the change.

## What happens

The Bot registers the PixelMug device and sends a button that opens the WebApp. The WebApp discovers devices from the current Bubble session, creates a `talPrintText` RPC with the selected options, and sends it through the WebApp device bridge.
