import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'any',
});

const mug = new PixelMugS1();
mug.name = '像素水杯';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[webapp-device-rpc]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: '请选择一台 PixelMug S1 或 PixelMug P1。',
      actionButtonTitle: '关联设备',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('打开设备控制', process.env.STUDIO_WEBAPP_URL);

    await ctx.sendKeyboard('打开 WebApp，控制水杯屏幕。', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: '关联 PixelMug' },
  { command: 'open', description: '打开设备控制页面' },
]);

await bot.start({ device: false });

console.log('WebApp 设备 RPC 示例已启动，请先发送 /bind，再发送 /open。');
