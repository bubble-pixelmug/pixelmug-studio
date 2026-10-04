import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'any',
});
bot.registerDevices([new PixelMugS1()]);

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/help') {
    await ctx.sendText('用手机触摸板控制 PixelMug 上的光点：滑动移动光点，轻点绽放火花。仅支持 PixelMug S1 系列。\n\n请先在 Studio 勾选“启动后自动运行设备代码”。使用 /bindPixelMug 关联设备，等待杯子出现光点，再使用 /webApp 打开触摸板并连接蓝牙。');
    return;
  }

  if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择要关联的 PixelMug S1。',
      actionButtonTitle: '关联 PixelMug',
    });
    return;
  }

  if (text === '/webApp') {
    await ctx.sendKeyboard('光点实时控制触摸板',
      new InlineKeyboard().url('打开', process.env.STUDIO_WEBAPP_URL));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'help', description: '了解这个 Bot 的使用方法' },
  { command: 'bindPixelMug', description: '关联你的 PixelMug' },
  { command: 'webApp', description: '打开光点触摸板' },
]);
await bot.start();
