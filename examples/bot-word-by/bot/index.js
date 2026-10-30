import {
  BubbleBot,
  isNeedBindDeviceError,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1, {
  Specifications,
} from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});
const firstMug = createMug('First mug');
const secondMug = createMug('Second mug');
const printTasks = new Map();

bot.registerDevices([firstMug, secondMug]);

bot.on('error', (ctx) => {
  console.error('[bot-word-by]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/bind') {
    await sendBindCard(ctx);
    return;
  }

  const parts = splitText(text);
  if (parts.length < 2) {
    await ctx.sendText(
      'Enter at least two characters, or enter two words separated by a space.',
    );
    return;
  }

  const devices = await bot.getBoundDevices(ctx);
  const firstBound = devices.some((device) => Number(device.slot) === 1);
  const secondBound = devices.some((device) => Number(device.slot) === 2);

  if (!firstBound || !secondBound) {
    await sendBindCard(ctx);
    return;
  }

  try {
    await submitPrintTask(ctx, firstMug, parts[0], 'First mug');
    await submitPrintTask(ctx, secondMug, parts[1], 'Second mug');

    await ctx.sendText(
      `Print tasks submitted: First mug displays "${parts[0]}", `
      + `Second mug displays "${parts[1]}".`,
    );
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await sendBindCard(ctx);
      return;
    }

    if (error?.response?.code === 'DEVICE_OFFLINE') {
      await ctx.sendText('A mug is offline. Turn it on and connect it before trying again.');
      return;
    }

    throw error;
  }
});

bot.on('device_call:response', async (ctx) => {
  const task = finishPrintTask(ctx);
  if (!task) return;
  await ctx.sendText(`${task.label} finished displaying the text.`);
});

bot.on('device_call:timeout', async (ctx) => {
  const task = finishPrintTask(ctx);
  if (!task) return;
  await ctx.sendText(`${task.label} timed out while waiting for a response.`);
});

bot.on('device_call:error', async (ctx) => {
  const task = finishPrintTask(ctx);
  if (!task) return;
  await ctx.sendText(`${task.label} failed to display the text.`);
});

await bot.setCommands([
  { command: 'bind', description: 'Bind two PixelMug devices' },
]);

await bot.start();

console.log('Word By Bot started.');

function createMug(name) {
  const mug = new PixelMugS1();
  mug.name = name;
  mug.compatible = ['PixelMug'];
  return mug;
}

function splitText(text) {
  if (!text) return [];

  const words = text.split(/\s+/);
  if (words.length > 1) return words.slice(0, 2);

  return Array.from(text).slice(0, 2);
}

async function submitPrintTask(ctx, mug, text, label) {
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

  printTasks.set(task.traceId, { label });
}

function finishPrintTask(ctx) {
  const traceId = ctx.deviceCall?.traceId;
  if (!traceId) return undefined;

  const task = printTasks.get(traceId);
  if (!task) return undefined;

  printTasks.delete(traceId);
  return task;
}

async function sendBindCard(ctx) {
  await ctx.sendBindDevice({
    content: 'Bind one PixelMug S1 or PixelMug P1 to each slot.',
    actionButtonTitle: 'Bind two mugs',
  });
}
