import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });
const mug = new PixelMugS1();

mug.name = '我的像素水杯';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-device-binding]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: '为这个 Bot 选择一台 PixelMug S1 或 PixelMug P1。',
      actionButtonTitle: '关联设备',
    });
  } else if (command === '/status') {
    await sendStatus(ctx);
  }
});

bot.on('message:bind_device', async (ctx) => {
  await ctx.sendText('设备关联已经更新。');
  await sendStatus(ctx);
});

await bot.setCommands([
  { command: 'bind', description: '关联像素水杯' },
  { command: 'status', description: '查看关联状态' },
]);

await bot.start();

console.log('设备关联示例已启动。');

async function sendStatus(ctx) {
  const devices = await bot.getBoundDevices(ctx);
  const bound = devices.find((device) => Number(device.slot) === 1);

  if (!bound) {
    await ctx.sendText('slot 1 尚未关联设备，请发送 /bind。');
    return;
  }

  const online = bound.online === undefined
    ? '未知'
    : bound.online
      ? '在线'
      : '离线';

  await ctx.sendText([
    'slot：' + bound.slot,
    '名称：' + (bound.name || bound.deviceId),
    '实际型号：' + (bound.talId || '未知'),
    '状态：' + online,
  ].join('\n'));
}