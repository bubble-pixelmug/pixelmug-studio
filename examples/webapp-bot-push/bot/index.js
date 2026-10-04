import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

bot.onWebAppRequest('app.startTask', async (ctx) => {
  await ctx.sendWebAppData('app.progress', { progress: 0 });

  for (let progress = 20; progress <= 100; progress += 20) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await ctx.sendWebAppData('app.progress', { progress });
  }

  return { message: '任务完成' };
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.trim() !== '/open') return;

  const keyboard = new InlineKeyboard()
    .url('打开 WebApp', process.env.STUDIO_WEBAPP_URL);

  await ctx.sendKeyboard('打开页面，查看 Bot 推送的任务进度。', keyboard);
});

await bot.setCommands([
  { command: 'open', description: '打开 WebApp' },
]);

await bot.start({ device: false });
