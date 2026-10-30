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
  webAppDeviceAccess: 'any',
});

const mug = new PixelMugS1();
mug.name = 'PixelMug';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[webapp-device-rpc]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: 'Bind a PixelMug S1 or PixelMug P1.',
      actionButtonTitle: 'Bind device',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('Open device control', webAppUrl);

    await ctx.sendKeyboard('Open the WebApp to control the PixelMug display.', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: 'Bind a PixelMug' },
  { command: 'open', description: 'Open device control' },
]);

await bot.start({ device: false });

console.log('WebApp device RPC example started. Send /bind, then /open.');
