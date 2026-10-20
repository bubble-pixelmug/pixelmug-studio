import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMug from '@jeejio-bubble/bot/devices/pixelmug';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: process.env.BOT_API_BASE_URL,  
  webAppDeviceAccess: 'any',
});
const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error('Missing required environment variable: STUDIO_WEBAPP_URL');

const mug = new PixelMug();
mug.compatible = ['PixelMugS1'];
bot.registerDevices([mug]);

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  console.log(`Bot log: ${text}`);
  
  if (text === '/help') {
    await ctx.sendText('Open the Text Control WebApp from this bot. Use /bindPixelMug to bind a device, then /webApp to open the controller.');
    return;
  }

  if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select the PixelMug you want to bind.',
      actionButtonTitle: 'Bind PixelMug',
    });
    return;
  }

  if (text === '/webApp') {
    await ctx.sendKeyboard(
      'Open the Text Control WebApp to configure and display text.',
      new InlineKeyboard().url('Open text controller', webAppUrl),
    );
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));

await bot.setCommands([
  { command: 'help', description: 'Show help message' },
  { command: 'bindPixelMug', description: 'Bind your PixelMug' },
  { command: 'webApp', description: 'Open the Text Control WebApp' },
]);
await bot.start();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
