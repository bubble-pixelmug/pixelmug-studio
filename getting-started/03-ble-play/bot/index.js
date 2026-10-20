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
  console.log(`Bot log: ${text}`);

  if (text === '/help') {
    await ctx.sendText('Use the phone touchpad to control the light dot on your PixelMug: move the dot by dragging and create sparks by tapping. PixelMug S1 devices are supported.\n\nEnable automatic device code loading in Studio, use /bindPixelMug to bind a device, wait for the dot to appear, then use /webApp to open the touchpad and connect over Bluetooth.');
    return;
  }

  if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select the PixelMug S1 you want to bind.',
      actionButtonTitle: 'Bind PixelMug',
    });
    return;
  }

  if (text === '/webApp') {
    await ctx.sendKeyboard('Control the light dot from the touchpad.',
      new InlineKeyboard().url('Open touchpad', launchUrl.toString()));
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'help', description: 'Show help message' },
  { command: 'bindPixelMug', description: 'Bind a PixelMug' },
  { command: 'webApp', description: 'Open the dot control touchpad' },
]);
await bot.start();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
