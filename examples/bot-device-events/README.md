# Bot Device Events

A Bot-only example that registers a PixelMug device, lets a user bind it, and sends a message when its charging state changes.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Start the Agent.
4. Send `/bind` and choose a PixelMug S1 or PixelMug P1.
5. Send `/watch` to receive charging notifications.

Studio injects `BOT_TOKEN` and `BOT_API_BASE_URL` into the Bot process. Credentials and service URLs are not stored in the project.

## Deploy to a cloud server

This project has no WebApp and no MPY component. It does not require an MPS ID, MPS token, static WebApp server, or Caddy configuration.

The cloud runtime installs the root dependencies with the checked-in `package-lock.json`, injects `BOT_TOKEN` and `BOT_API_BASE_URL`, and starts `node bot/index.js`.

## Commands

- `/bind` opens the device binding flow.
- `/watch` starts charging notifications for the bound devices in the current chat.
- `/unwatch` stops charging notifications for the current chat.

The Bot registers `PixelMugS1` with the SDK and accepts devices compatible with `PixelMug`. Device notifications are parsed by the registered device extension.

## Files

- `bot/index.js` contains device registration, binding, event handling, and environment validation.
- `package.json` declares the Bot SDK runtime dependency.
- `package-lock.json` locks the dependency tree used by Studio and cloud builds.
