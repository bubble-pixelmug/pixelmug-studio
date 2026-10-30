# Message Events Bot

This example demonstrates middleware, event handlers, the event context, and `next()`.

After starting the example in Studio, send any text to observe the order in which the `message:text` and general `message` handlers run. Send `/help` to see the usage message.

The bot reads its configuration from the `BOT_TOKEN` and optional `BOT_API_BASE_URL` environment variables.
