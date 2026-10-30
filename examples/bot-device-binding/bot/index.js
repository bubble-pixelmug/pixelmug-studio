import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: requiredEnv('BOT_API_BASE_URL'),
});
const mug = new PixelMugS1();

mug.name = 'PixelMug S1';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-device-binding]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: 'Select a PixelMug S1 or PixelMug P1 for this Bot.',
      actionButtonTitle: 'Bind device',
    });
  } else if (command === '/status') {
    await sendStatus(ctx);
  }
});

bot.on('message:bind_device', async (ctx) => {
    await ctx.sendText('Device binding updated.');
  await sendStatus(ctx);
});

await bot.setCommands([
  { command: 'bind', description: 'Bind a PixelMug' },
  { command: 'status', description: 'Show binding status' },
]);

await bot.start();

console.log('Bot device binding example started.');

async function sendStatus(ctx) {
  const devices = await bot.getBoundDevices(ctx);
  const bound = devices.find((device) => Number(device.slot) === 1);

  if (!bound) {
    await ctx.sendText('Slot 1 has no bound device. Send /bind to choose one.');
    return;
  }

  const online = bound.online === undefined
    ? 'Unknown'
    : bound.online
      ? 'Online'
      : 'Offline';

  await ctx.sendText([
    'Slot: ' + bound.slot,
    'Name: ' + (bound.name || bound.deviceId),
    'Device Defined: ' + (bound.talId || 'Unknown'),
    'Status: ' + online,
  ].join('\n'));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
