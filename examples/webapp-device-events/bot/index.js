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
});

const mug = new PixelMugS1();
mug.name = 'PixelMug S1';
bot.registerDevices([mug]);

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: 'Bind a PixelMug S1.',
      actionButtonTitle: 'Bind device',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('Open device events', webAppUrl);

    await ctx.sendKeyboard('Open the WebApp to subscribe to PixelMug S1 charging events.', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: 'Bind a PixelMug S1' },
  { command: 'open', description: 'Open device events' },
]);

await bot.start();
