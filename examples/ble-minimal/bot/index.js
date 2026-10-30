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
      'Minimal BLE example: connect a PixelMug, select echo, and see echo on the display.\n\n' +
      '1. Enable automatic device code startup in Studio and start the Agent.\n' +
      '2. Use /bindPixelMug to bind a PixelMug S1 Pro or Lite.\n' +
      '3. Wait for DISC on the mug, then use /webApp to open the page.\n' +
      '4. Connect for CONN, select echo to display echo, and disconnect to return to DISC.'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select the PixelMug S1 Pro or Lite for this BLE example.',
      actionButtonTitle: 'Bind PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard('Connect the PixelMug and send the first BLE command.',
      new InlineKeyboard().url('Open BLE example', launchUrl.toString()));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: 'Bind a PixelMug' },
  { command: 'help', description: 'Show BLE example instructions' },
  { command: 'webApp', description: 'Open the BLE example page' },
]);
await bot.start();
