import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: requiredEnv('BOT_API_BASE_URL'),
});
const mug = new PixelMugS1();
const watches = new Map();

mug.name = 'PixelMug S1';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-device-events]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: 'Select a PixelMug S1 or PixelMug P1 for this Bot.',
      actionButtonTitle: 'Bind device',
    });
  } else if (command === '/watch') {
    const count = await refreshWatch(ctx);
    await ctx.sendText(
      count ? 'Charging notifications enabled.' : 'Bind a device first with /bind.',
    );
  } else if (command === '/unwatch') {
    watches.delete(chatKey(ctx.chat));
    await ctx.sendText('Charging notifications disabled.');
  }
});

bot.on('message:bind_device', async (ctx) => {
  if (watches.has(chatKey(ctx.chat))) {
    await refreshWatch(ctx);
  }
});

bot.on('device_notify', async (ctx) => {
  const deviceId = String(ctx.from?.id || '');
  if (!deviceId) return;

  for (const event of mug.parseNotify(ctx.tal?.notify || [])) {
    if (event.name !== 'CurChargingState') continue;

    const charging = [true, 1, '1'].includes(event.params?.value);
    for (const watch of watches.values()) {
      if (!watch.deviceIds.has(deviceId)) continue;

      await bot.api.sendTextMessage({
        chat: watch.chat,
        to: watch.to,
        mentionOnly: watch.chat.type === 'group',
        text: charging
          ? 'PixelMug is charging.'
          : 'PixelMug has stopped charging.',
      });
    }
  }
});

await bot.setCommands([
  { command: 'bind', description: 'Bind a PixelMug' },
  { command: 'watch', description: 'Watch charging status' },
  { command: 'unwatch', description: 'Stop watching charging status' },
]);

await bot.start();

console.log('Bot device events example started.');

async function refreshWatch(ctx) {
  const devices = await bot.getBoundDevices(ctx);

  watches.set(chatKey(ctx.chat), {
    chat: ctx.chat,
    to: ctx.from,
    deviceIds: new Set(devices.map((device) => String(device.deviceId))),
  });

  return devices.length;
}

function chatKey(chat) {
  return `${chat.type || 'chat'}:${chat.id}`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
