# PixelMug Studio

PixelMug Studio is a local development, run, and debugging tool for Bubble agent applications. Every application includes a bot and can optionally include a WebApp and MPY device code.

## Setup

Requires Node.js 20.6 or later. Run these commands in `tools/studio`:

```sh
npm ci
npm run build
npm start
```

Open the complete Studio URL printed in the terminal. The management service listens locally. Keep the computer, the phone running the Bubble App, and PixelMug on the same LAN.

## Language

Select **中文** or **English** at the top right. Chinese is the default, and your selection is remembered in this browser. Switching languages updates the interface without reloading, signing out, or restarting the agent. Original Chinese copy is retained. Application source, user names, log payloads, and external documentation remain in their original language. Unknown upstream errors are displayed verbatim.

## Workflow

1. Sign in with your Bubble account. Devices and bots load automatically.
2. In **My Bubble**, set the bot token. It stays in memory for this Studio session.
3. In **Select application**, open a local project and check its run configuration.
4. In **Run & debug**, start the agent. Try the bot and WebApp in the Bubble App.
5. For applications with MPY, use the agent to load device code or enable **Run device code automatically on start**.
6. Inspect application logs and each device’s deployment progress and MPY logs.
7. Restart the agent to reload saved code. Stop the agent to close local services and request normal reboots of deployed devices.

Applications require `bot/` and a `.js`, `.mjs`, or `.cjs` bot entry. Optional `webapp/` applications use `index.html`; optional `mpy/` applications require `__main__.py` and `mps.json`.

Runtime logs are saved in the application’s `debug/<runId>/` directory. Dependencies, build output (`ui-dist/`, `dist/`, `build/`), runtime data, local credentials, caches, and temporary files are excluded from Git. Rebuild with `npm run build` after editing the Studio interface.

For detailed SDK, networking, deployment, and debugging notes, see the original [Chinese README](README.md).
