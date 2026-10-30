import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

bot.on('error', (ctx) => {
  console.error('[bot-message-events]', ctx.error?.message || ctx.error);
});

bot.use(async (ctx, next) => {
  const started = Date.now();

  try {
    await next();
    console.log(`[${ctx.event}] handled in ${Date.now() - started} ms`);
  } catch (error) {
    console.error(`[${ctx.event}] failed`, error);
    throw error;
  }
});

bot.on('message:text', async (ctx, next) => {
  if (ctx.message.text.trim() === '/help') {
    await ctx.sendText('Send any text to observe the handler execution order.');
    return;
  }

  console.log('message:text handler received a text message first');
  await next();
});

bot.on('message', async (ctx) => {
  if (!ctx.message?.text) return;

  const sender = ctx.from?.name || 'friend';
  await ctx.sendText(`${sender}, the general message handler received: ${ctx.message.text}`);
});

await bot.start({ device: false });

console.log('Message events example started.');
