# Bot Device RPC

A Bot-only example that sends text to a bound PixelMug through an asynchronous device RPC and reports the result.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Start the Agent.
4. Send `/bind` and choose a PixelMug S1 or PixelMug P1.
5. Send any text message. The Bot sends it to the bound device for display.

Studio injects `BOT_TOKEN` and `BOT_API_BASE_URL` into the Bot process. Credentials and service URLs are not stored in the project.

## Deploy to a cloud server

This project has no WebApp and no MPY component. It does not require an MPS ID, MPS token, static WebApp server, or Caddy configuration.

The cloud runtime installs the root dependencies with the checked-in `package-lock.json`, injects `BOT_TOKEN` and `BOT_API_BASE_URL`, and starts `node bot/index.js`.

## Commands

- `/bind` opens the device binding flow.
- Any other non-empty text message is sent to the bound PixelMug.

The Bot uses `callDeviceAsync` and handles response, timeout, and error events for each request.

## Files

- `bot/index.js` contains device registration, binding, asynchronous RPC calls, and environment validation.
- `package.json` declares the Bot SDK runtime dependency.
- `package-lock.json` locks the dependency tree used by Studio and cloud builds.
