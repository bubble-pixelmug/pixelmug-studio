import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

bot.on('error', (ctx) => {
  console.error('[webapp-hello-bot]', ctx.error?.message || ctx.error);
});

bot.onWebAppRequest('app.hello', async (ctx) => {
  const name = String(ctx.webAppData.payload?.name || '朋友').trim() || '朋友';

  return {
    message: `来自 Bot 的回复：你好，${name}！`,
  };
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.trim() !== '/open') return;

  const keyboard = new InlineKeyboard()
    .url('打开 WebApp', process.env.STUDIO_WEBAPP_URL);

  await ctx.sendKeyboard('点击下面的按钮打开第一个 WebApp。', keyboard);
});

await bot.setCommands([
  { command: 'open', description: '打开第一个 WebApp' },
]);

await bot.start({ device: false });

console.log('WebApp Hello Bot 已启动，请在冒泡 App 中发送 /open。');
