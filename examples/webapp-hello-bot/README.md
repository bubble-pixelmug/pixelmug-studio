# Hello WebApp

This is a minimal two-way communication example. The Bot provides a WebApp entry in the chat. The user enters a name, and the WebApp sends an `app.hello` request to the Bot and displays the returned greeting.

## Run

1. Open this directory in Studio and configure the Bot token and API URL.
2. Start the Bot. No device binding or device-side project is required.
3. In the Bubble app, send `/open` to the Bot.
4. Open the WebApp, enter a name, and send the greeting request.

## Files

| File | Purpose |
| --- | --- |
| `bot/index.js` | Provides the WebApp entry and handles `app.hello` requests |
| `webapp/index.html` | Defines the page structure |
| `webapp/src/main.js` | Creates `BubbleWebApp` and sends requests to the Bot |
| `webapp/src/style.css` | Styles the WebApp |
| `webapp/vite.config.js` | Configures relative asset URLs for Studio |

Related documentation: [Hello WebApp](../../../../docs/webapp/quick-start.md).
