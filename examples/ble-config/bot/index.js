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
      'BLE 配置上传：五种数据类型已设置默认值，发送后在杯子上逐条显示。\n\n' +
      '1. 在 Studio 勾选“启动后自动运行设备代码”并启动。\n' +
      '2. /bindPixelMug：关联 PixelMug S1 Pro/Lite。\n' +
      '3. 等杯子显示 WAIT 后，/webApp 打开页面并点击连接。\n' +
      '4. 直接发送默认配置，或修改 config1 到 config5 后发送。'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择用于 BLE 配置上传示例的 PixelMug S1 Pro/Lite。',
      actionButtonTitle: '关联 PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard('发送五种数据类型的配置到杯子显示。',
      new InlineKeyboard().url('打开配置上传示例', process.env.STUDIO_WEBAPP_URL));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: '关联 PixelMug' },
  { command: 'help', description: '查看配置上传示例使用方法' },
  { command: 'webApp', description: '打开配置上传页面' },
]);
await bot.start();
