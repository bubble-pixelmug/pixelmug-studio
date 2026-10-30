import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: requiredEnv('BOT_API_BASE_URL'),
});

bot.on('error', (ctx) => {
  console.error('[bot-first-bot]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  await ctx.replyText(`Received: ${ctx.message.text}`);
});

await bot.start({ device: false });

console.log('First Bot example started. Send a message from the Bubble app.');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
