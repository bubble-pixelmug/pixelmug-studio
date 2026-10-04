import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMug from '@jeejio-bubble/bot/devices/pixelmug';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'any',
});
const mug = new PixelMug();
mug.compatible = ['PixelMugS1'];
bot.registerDevices([mug]);

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/help') {
    await ctx.sendText('在 WebApp 中输入文字，调整字体、颜色和滚动效果，让 PixelMug 显示它。\n\n使用 /bindPixelMug 关联设备，再使用 /webApp 打开文字控制器。');
    return;
  }

  if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择要关联的 PixelMug。',
      actionButtonTitle: '关联 PixelMug',
    });
    return;
  }

  if (text === '/webApp') {
    await ctx.sendKeyboard('打开文字控制器，设置 PixelMug 显示的文字。',
      new InlineKeyboard().url('打开文字控制器', process.env.STUDIO_WEBAPP_URL));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'help', description: '了解这个 Bot 的使用方法' },
  { command: 'bindPixelMug', description: '关联你的 PixelMug' },
  { command: 'webApp', description: '打开 PixelMug 文字控制器' },
]);
await bot.start();
