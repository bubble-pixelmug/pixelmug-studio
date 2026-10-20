import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: 'any',
});
bot.registerDevices([new PixelMugS1()]);
const webAppUrl = requiredEnv('STUDIO_WEBAPP_URL');
const mpsId = requiredEnv('STUDIO_MPS_ID');
const mpsVersion = requiredEnv('STUDIO_MPS_VERSION');
const launchUrl = new URL(webAppUrl);
launchUrl.searchParams.set('mps_id', mpsId);
launchUrl.searchParams.set('mps_version', mpsVersion);

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === '/help') {
    await ctx.sendText(
      'BLE configuration upload: five data types are prefilled and shown on the Mug after upload.\n\n' +
      '1. Enable automatic device code loading in Studio and start the Agent.\n' +
      '2. Use /bindPixelMug to bind a PixelMug S1 Pro or Lite.\n' +
      '3. Wait for WAIT on the cup, then use /webApp and connect.\n' +
      '4. Send the default configuration, or edit config1 through config5 first.'
    );
  } else if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select the PixelMug S1 Pro or Lite for this BLE configuration example.',
      actionButtonTitle: 'Bind PixelMug',
    });
  } else if (text === '/webApp') {
    await ctx.sendKeyboard('Send five data types of configuration to the cup display.',
      new InlineKeyboard().url('Open configuration uploader', launchUrl.toString()));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'bindPixelMug', description: 'Bind a PixelMug' },
  { command: 'help', description: 'Show configuration uploader help' },
  { command: 'webApp', description: 'Open the configuration uploader' },
]);
await bot.start();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
