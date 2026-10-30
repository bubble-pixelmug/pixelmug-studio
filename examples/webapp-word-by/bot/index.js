import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error('WebApp URL is not configured');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'all',
});

const firstMug = createMug('First mug');
const secondMug = createMug('Second mug');
bot.registerDevices([firstMug, secondMug]);

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: 'Bind a PixelMug S1 or PixelMug P1 to each slot.',
      actionButtonTitle: 'Bind two mugs',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('Open Word By', webAppUrl);

    await ctx.sendKeyboard('Open the WebApp and show text on both mugs.', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: 'Bind two PixelMug devices' },
  { command: 'open', description: 'Open Word By' },
]);

await bot.start({ device: false });

function createMug(name) {
  const mug = new PixelMugS1();
  mug.name = name;
  mug.compatible = ['PixelMug'];
  return mug;
}
