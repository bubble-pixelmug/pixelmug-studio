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

bot.onWebAppRequest('app.startTask', async (ctx) => {
  await ctx.sendWebAppData('app.progress', { progress: 0 });

  for (let progress = 20; progress <= 100; progress += 20) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await ctx.sendWebAppData('app.progress', { progress });
  }

  return { message: 'Task complete.' };
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.trim() !== '/open') return;

  const keyboard = new InlineKeyboard()
    .url('Open WebApp', webAppUrl);

  await ctx.sendKeyboard('Open the page to watch the Bot push task progress.', keyboard);
});

await bot.setCommands([
  { command: 'open', description: 'Open the WebApp' },
]);

await bot.start({ device: false });
