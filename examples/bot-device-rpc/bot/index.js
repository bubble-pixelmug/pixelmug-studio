import {
  BubbleBot,
  isNeedBindDeviceError,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1, {
  Specifications,
} from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: requiredEnv('BOT_API_BASE_URL'),
});
const mug = new PixelMugS1();
const printTasks = new Set();

mug.name = 'PixelMug S1';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-device-rpc]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/bind') {
    await ctx.sendBindDevice({
      content: 'Select a PixelMug S1 or PixelMug P1 for this Bot.',
      actionButtonTitle: 'Bind device',
    });
    return;
  }

  if (!text) return;

  try {
    const rpc = await mug.rpc.talPrintText({
      text,
      specifications: Specifications.SMALL,
      color: '#00ff66',
      speed: 80,
      direction: 0,
    });

    const task = await ctx.callDeviceAsync(mug, rpc, {
      requireOnline: true,
      timeout: 30000,
    });

    printTasks.add(task.traceId);
    await ctx.sendText(`Print request accepted: ${task.traceId}`);
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await ctx.sendBindDevice({
        content: 'Bind a PixelMug before sending text.',
        actionButtonTitle: 'Bind device',
      });
      return;
    }

    await ctx.sendText(`Print request failed: ${error.message || error}`);
    throw error;
  }
});

bot.on('device_call:response', async (ctx) => {
  if (!finishPrintTask(ctx)) return;
  await ctx.sendText('The device finished displaying the text.');
});

bot.on('device_call:timeout', async (ctx) => {
  if (!finishPrintTask(ctx)) return;
  await ctx.sendText('The display task timed out while waiting for the device.');
});

bot.on('device_call:error', async (ctx) => {
  if (!finishPrintTask(ctx)) return;
  await ctx.sendText('The device failed to display the text.');
});

await bot.setCommands([
  { command: 'bind', description: 'Bind a PixelMug' },
]);

await bot.start();

console.log('Bot device RPC example started.');

function finishPrintTask(ctx) {
  const traceId = ctx.deviceCall?.traceId;
  if (!traceId || !printTasks.has(traceId)) return false;

  printTasks.delete(traceId);
  return true;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
