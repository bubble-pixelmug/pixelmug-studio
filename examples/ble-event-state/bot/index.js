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
      'BLE 状态与事件：杯子每秒计数，网页显示当前值和最近一次事件。\n\n' +
      '1. 在 Studio 勾选“启动后自动运行设备代码”并启动。\n' +
      '2. /bindPixelMug：关联 PixelMug S1 Pro/Lite。\n' +
      '3. 等杯子开始计数后，/webApp 打开页面并点击连接。\n' +
      '4. 10、20…90 时产生整十事件，99 回到 0 时产生重置事件。'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择用于 BLE 状态与事件示例的 PixelMug S1 Pro/Lite。',
      actionButtonTitle: '关联 PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard('查看杯子的当前计数与事件通知。',
      new InlineKeyboard().url('打开状态与事件示例', process.env.STUDIO_WEBAPP_URL));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: '关联 PixelMug' },
  { command: 'help', description: '查看状态与事件示例使用方法' },
  { command: 'webApp', description: '打开状态与事件页面' },
]);
await bot.start();
