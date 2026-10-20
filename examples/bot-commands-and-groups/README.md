# Bot Commands and Groups

A Bot-only example that demonstrates command menus, group join messages, command parsing with optional `@Bot` suffixes, context inspection, and messages visible to the whole group.

## Run in Studio

1. Open this directory in Studio and select `bot/index.js` as the Bot entry point.
2. Select a Bot with a configured token in **My Bubble**.
3. Start the Agent.
4. Send `/help`, `/whoami`, or `/announce` to the Bot. Add the Bot to a group to test the group behavior.

Studio injects `BOT_TOKEN` and `BOT_API_BASE_URL` into the Bot process. The project does not store credentials or service URLs in source code.

## Deploy to a cloud server

This project has no WebApp and no MPY component. Deployment therefore does not require an MPS ID, MPS token, WebApp URL, static server, or Caddy configuration.

The deployment runtime installs the root dependencies with the checked-in `package-lock.json`, injects `BOT_TOKEN` and `BOT_API_BASE_URL`, and starts `node bot/index.js`.

## Commands

- `/help` explains the available commands.
- `/whoami` displays the chat type, chat name or ID, and sender name or ID.
- `/announce` sends a message to the whole group instead of limiting delivery to mentions.

Commands are recognized in both `/help` and `/help@BotName` form. Group messages use the SDK's `group_policy: 'mention'` setting, so the Bot responds to messages that mention it.

## Files

- `bot/index.js` contains the Bot logic and environment validation.
- `package.json` declares the Bot SDK runtime dependency.
- `package-lock.json` locks the exact dependency tree used by Studio and cloud builds.
