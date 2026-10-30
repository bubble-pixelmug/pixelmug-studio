# First Bot

A minimal Bot example that replies to every text message.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Start the Agent.
4. Send a text message from the Bubble app.

Studio injects `BOT_TOKEN` and `BOT_API_BASE_URL` into the Bot process. Credentials and service URLs are not stored in the project.

## Deploy to a cloud server

This project has no WebApp and no MPY component. It does not require an MPS ID, MPS token, static WebApp server, or Caddy configuration.

The cloud runtime installs the root dependencies with the checked-in `package-lock.json`, injects `BOT_TOKEN` and `BOT_API_BASE_URL`, and starts `node bot/index.js`.

## Files

- `bot/index.js` contains the reply handler and environment validation.
- `package.json` declares the Bot SDK runtime dependency.
- `package-lock.json` locks the dependency tree used by Studio and cloud builds.
