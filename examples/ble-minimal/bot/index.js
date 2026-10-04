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
      'BLE 最小示例：连接 PixelMug，点击 echo，在杯子上看到 echo。\n\n' +
      '1. 在 Studio 勾选“启动后自动运行设备代码”并启动。\n' +
      '2. /bindPixelMug：关联 PixelMug S1 Pro/Lite。\n' +
      '3. 等杯子显示 DISC 后，/webApp 打开页面。\n' +
      '4. 连接后显示 CONN；点击 echo 后显示 echo；断开后显示 DISC。'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择用于 BLE 示例的 PixelMug S1 Pro/Lite。',
      actionButtonTitle: '关联 PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard('连接 PixelMug，发送第一条 BLE 命令。',
      new InlineKeyboard().url('打开 BLE 示例', process.env.STUDIO_WEBAPP_URL));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: '关联 PixelMug' },
  { command: 'help', description: '查看 BLE 示例使用方法' },
  { command: 'webApp', description: '打开 BLE 示例页面' },
]);
await bot.start();