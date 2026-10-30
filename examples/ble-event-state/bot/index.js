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
      'BLE state and events: the mug counts every second while the WebApp shows the current value and latest event.\n\n' +
      '1. Enable automatic device code startup in Studio and start the Agent.\n' +
      '2. Use /bindPixelMug to bind a PixelMug S1 Pro or Lite.\n' +
      '3. Wait for the counter to start, then use /webApp and install MPY.\n' +
      '4. Connect to watch multiples of ten and counter reset events.'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select the PixelMug S1 Pro or Lite for this BLE state and events example.',
      actionButtonTitle: 'Bind PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard('View the mug counter and event notifications.',
      new InlineKeyboard().url('Open state and events', launchUrl.toString()));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: 'Bind a PixelMug' },
  { command: 'help', description: 'Show state and events instructions' },
  { command: 'webApp', description: 'Open the state and events page' },
]);
await bot.start();
