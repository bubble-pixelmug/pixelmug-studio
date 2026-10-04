import {
  BubbleBot,
  isNeedBindDeviceError,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1, {
  Specifications,
} from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });
const firstMug = createMug('第一个杯子');
const secondMug = createMug('第二个杯子');
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
      '请输入至少两个字，或输入两个用空格分隔的单词。',
    );
    return;
  }

  const devices = await bot.getBoundDevices(ctx);
  const firstBound = devices.some(
    (device) => Number(device.slot) === 1,
  );
  const secondBound = devices.some(
    (device) => Number(device.slot) === 2,
  );

  if (!firstBound || !secondBound) {
    await sendBindCard(ctx);
    return;
  }

  try {
    await submitPrintTask(ctx, firstMug, parts[0], '第一个杯子');
    await submitPrintTask(ctx, secondMug, parts[1], '第二个杯子');

    await ctx.sendText(
      '已提交显示任务：第一个杯子显示“' + parts[0] +
      '”，第二个杯子显示“' + parts[1] + '”。',
    );
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await sendBindCard(ctx);
      return;
    }

    if (error?.response?.code === 'DEVICE_OFFLINE') {
      await ctx.sendText('有杯子处于离线状态，请开机联网后再试。');
      return;
    }

    throw error;
  }
});

bot.on('device_call:response', async (ctx) => {
  const task = finishPrintTask(ctx);
  if (!task) return;
  await ctx.sendText(task.label + '显示完成。');
});

bot.on('device_call:timeout', async (ctx) => {
  const task = finishPrintTask(ctx);
  if (!task) return;
  await ctx.sendText(task.label + '等待响应超时。');
});

bot.on('device_call:error', async (ctx) => {
  const task = finishPrintTask(ctx);
  if (!task) return;
  await ctx.sendText(task.label + '显示失败。');
});

await bot.setCommands([
  { command: 'bind', description: '关联两个像素水杯' },
]);

await bot.start();

console.log('Word By Bot 已启动。');

function createMug(name) {
  const mug = new PixelMugS1();
  mug.name = name;
  mug.compatible = ['PixelMug'];
  return mug;
}

function splitText(text) {
  if (!text) return [];

  const words = text.split(/\s+/);
  if (words.length > 1) {
    return words.slice(0, 2);
  }

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
    content: '请分别为两个 slot 关联一台 S1 或 P1。',
    actionButtonTitle: '关联两个杯子',
  });
}