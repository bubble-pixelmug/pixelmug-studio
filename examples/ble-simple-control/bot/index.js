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
    await ctx.sendText(
      'BLE Simple 通道示例：在 WebApp 的网格上滑动，PixelMug 实时显示当前坐标。\n\n' +
      '1. 在 Studio 中启动项目并运行设备代码。\n' +
      '2. 使用 /bindPixelMug 关联 PixelMug。\n' +
      '3. 使用 /webApp 打开页面并连接蓝牙。\n' +
      '4. 在网格上触摸或拖动。'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择用于 BLE Simple 通道示例的 PixelMug。',
      actionButtonTitle: '关联 PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard(
      '打开坐标控制页面。',
      new InlineKeyboard().url('打开 BLE 示例', process.env.STUDIO_WEBAPP_URL)
    );
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: '关联 PixelMug' },
  { command: 'help', description: '查看示例使用方法' },
  { command: 'webApp', description: '打开坐标控制页面' },
]);
await bot.start();
