# Internationalized Bot

This example replies in Chinese, Japanese, or English based on `ctx.chat.language` or `ctx.from.language`. It also provides localized descriptions for the bot commands.

After starting the example in Studio:

- Send `/hello` to receive a greeting in the detected language.
- Send `/language` to see the language detected by the bot.
- Send any other text to receive help in the detected language.

The bot reads its configuration from the `BOT_TOKEN` and `BOT_API_BASE_URL` environment variables. The SDK does not translate business messages automatically; this example selects messages from the `messages` table and falls back to English when a language is unavailable.
