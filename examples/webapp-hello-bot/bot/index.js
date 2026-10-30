import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error('WebApp URL is not configured');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

bot.on('error', (ctx) => {
  console.error('[webapp-hello-bot]', ctx.error?.message || ctx.error);
});

bot.onWebAppRequest('app.hello', async (ctx) => {
  const name = String(ctx.webAppData.payload?.name || 'friend').trim() || 'friend';

  return {
    message: `Bot says hello, ${name}!`,
  };
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.trim() !== '/open') return;

  const keyboard = new InlineKeyboard()
    .url('Open WebApp', webAppUrl);

  await ctx.sendKeyboard('Use the button below to open the Hello WebApp.', keyboard);
});

await bot.setCommands([
  { command: 'open', description: 'Open the Hello WebApp' },
]);

await bot.start({ device: false });

console.log('WebApp Hello Bot started. Send /open in the Bubble app.');
