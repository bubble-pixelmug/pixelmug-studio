# Bot Push

This is a minimal example of a Bot pushing updates to a WebApp. The WebApp sends an `app.startTask` request, the Bot uses `ctx.sendWebAppData()` to push progress to the current page, and the page receives updates through `webapp.on()` before displaying the final response.

## Run

1. Open this directory in Studio and configure the Bot token and API URL.
2. Start the Bot. No device binding or device-side project is required.
3. In the Bubble app, send `/open` to the Bot.
4. Open the WebApp and select **Start task**.

## Files

| File | Purpose |
| --- | --- |
| `bot/index.js` | Provides the WebApp entry, handles requests, and pushes progress updates |
| `webapp/index.html` | Defines the page structure |
| `webapp/src/main.js` | Sends the task request and receives Bot updates |
| `webapp/src/style.css` | Styles the WebApp |
| `webapp/vite.config.js` | Configures relative asset URLs for Studio |

Related documentation: [Bot push updates](../../../../docs/webapp/push.md).
