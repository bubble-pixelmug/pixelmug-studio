import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

const mug = new PixelMugS1();
mug.name = 'PixelMug S1';
bot.registerDevices([mug]);

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: '请选择一台 PixelMug S1。',
      actionButtonTitle: '关联设备',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('打开设备事件页面', process.env.STUDIO_WEBAPP_URL);

    await ctx.sendKeyboard('打开 WebApp，订阅 PixelMug S1 的充电事件。', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: '关联 PixelMug S1' },
  { command: 'open', description: '打开设备事件页面' },
]);

await bot.start();
