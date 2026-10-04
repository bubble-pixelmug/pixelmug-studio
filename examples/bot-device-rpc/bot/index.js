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
const mug = new PixelMugS1();
const printTasks = new Set();

mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-device-rpc]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/bind') {
    await ctx.sendBindDevice({ actionButtonTitle: '关联设备' });
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
    await ctx.sendText('显示任务已受理：' + task.traceId);
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await ctx.sendBindDevice({ actionButtonTitle: '关联设备' });
      return;
    }
    throw error;
  }
});

bot.on('device_call:response', async (ctx) => {
  if (!finishPrintTask(ctx)) return;
  await ctx.sendText('设备已经完成文字显示任务。');
});

bot.on('device_call:timeout', async (ctx) => {
  if (!finishPrintTask(ctx)) return;
  await ctx.sendText('等待设备完成显示任务超时。');
});

bot.on('device_call:error', async (ctx) => {
  if (!finishPrintTask(ctx)) return;
  await ctx.sendText('设备执行文字显示任务失败。');
});

await bot.setCommands([
  { command: 'bind', description: '关联像素水杯' },
]);

await bot.start();

console.log('设备 RPC 示例已启动。');

function finishPrintTask(ctx) {
  const traceId = ctx.deviceCall?.traceId;
  if (!traceId || !printTasks.has(traceId)) return false;

  printTasks.delete(traceId);
  return true;
}