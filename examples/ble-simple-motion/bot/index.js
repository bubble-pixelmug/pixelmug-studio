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
      'BLE Simple 运动数据示例：在 WebApp 中实时查看 PixelMug 的三轴加速度和三轴角速度。\n\n' +
      '1. 在 Studio 中启动项目并运行设备代码。\n' +
      '2. 使用 /bindPixelMug 关联 PixelMug。\n' +
      '3. 使用 /webApp 打开页面。\n' +
      '4. 连接蓝牙并移动 PixelMug。'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择用于 BLE Simple 运动数据示例的 PixelMug。',
      actionButtonTitle: '关联 PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard(
      '打开六轴运动数据页面。',
      new InlineKeyboard().url('打开 BLE 示例', process.env.STUDIO_WEBAPP_URL)
    );
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: '关联 PixelMug' },
  { command: 'help', description: '查看示例使用方法' },
  { command: 'webApp', description: '打开运动数据页面' },
]);
await bot.start();
