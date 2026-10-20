# Bot Device Binding

A Bot-only example that registers a PixelMug device type, lets a user bind a device to the Bot, and reports the binding status.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Start the Agent.
4. Send `/bind` and choose a PixelMug S1 or PixelMug P1.
5. Send `/status` to view the bound slot, device name, actual model, and online state.

Studio injects `BOT_TOKEN` and `BOT_API_BASE_URL` into the Bot process. Credentials and service URLs are not stored in the project.

## Deploy to a cloud server

This project has no WebApp and no MPY component. It does not require an MPS ID, MPS token, static WebApp server, or Caddy configuration.

The cloud runtime installs the root dependencies with the checked-in `package-lock.json`, injects `BOT_TOKEN` and `BOT_API_BASE_URL`, and starts `node bot/index.js`.

## Commands

- `/bind` opens the device binding flow.
- `/status` reports the device currently bound to slot 1.

The Bot registers `PixelMugS1` with the SDK and accepts devices compatible with `PixelMug`. The device `talId` returned by the service is shown in the status response.

## Files

- `bot/index.js` contains the device registration, binding flow, status command, and environment validation.
- `package.json` declares the Bot SDK runtime dependency.
- `package-lock.json` locks the dependency tree used by Studio and cloud builds.
