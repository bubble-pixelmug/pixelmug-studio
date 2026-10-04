import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'all',
});

const firstMug = createMug('第一个杯子');
const secondMug = createMug('第二个杯子');
bot.registerDevices([firstMug, secondMug]);

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: '请分别为两个 slot 关联一台 PixelMug S1 或 PixelMug P1。',
      actionButtonTitle: '关联两个杯子',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('打开 Word By', process.env.STUDIO_WEBAPP_URL);

    await ctx.sendKeyboard('打开 WebApp，让两个杯子分别显示文字。', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: '关联两个像素水杯' },
  { command: 'open', description: '打开 Word By' },
]);

await bot.start({ device: false });

function createMug(name) {
  const mug = new PixelMugS1();
  mug.name = name;
  mug.compatible = ['PixelMug'];
  return mug;
}
