import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error('WebApp URL is not configured');

const mpsId = process.env.STUDIO_MPS_ID;
if (!mpsId) throw new Error('STUDIO_MPS_ID is required');

const mpsVersion = process.env.STUDIO_MPS_VERSION;
if (!mpsVersion) throw new Error('STUDIO_MPS_VERSION is required');

const launchUrl = new URL(webAppUrl);
launchUrl.searchParams.set('mps_id', mpsId);
launchUrl.searchParams.set('mps_version', mpsVersion);

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'any',
});
bot.registerDevices([new PixelMugS1()]);

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === '/help') {
    await ctx.sendText(
      'BLE Simple control example: move across the WebApp grid and show the current coordinate on the PixelMug.\n\n' +
      '1. Start the project in Studio and run the device code.\n' +
      '2. Use /bindPixelMug to bind a PixelMug.\n' +
      '3. Use /webApp to open the page and install MPY.\n' +
      '4. Connect over Bluetooth, then touch or drag on the grid.'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select the PixelMug for the BLE Simple control example.',
      actionButtonTitle: 'Bind PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard(
      'Open the coordinate control page.',
      new InlineKeyboard().url('Open BLE example', launchUrl.toString())
    );
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: 'Bind a PixelMug' },
  { command: 'help', description: 'Show example instructions' },
  { command: 'webApp', description: 'Open the coordinate control page' },
]);
await bot.start();
