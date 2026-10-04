import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });
const mug = new PixelMugS1();
const watches = new Map();

mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-device-events]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bind') {
    await ctx.sendBindDevice({ actionButtonTitle: '关联设备' });
  } else if (command === '/watch') {
    const count = await refreshWatch(ctx);
    await ctx.sendText(
      count ? '已关注充电状态。' : '请先关联设备。',
    );
  } else if (command === '/unwatch') {
    watches.delete(chatKey(ctx.chat));
    await ctx.sendText('已停止关注。');
  }
});

bot.on('message:bind_device', async (ctx) => {
  if (watches.has(chatKey(ctx.chat))) {
    await refreshWatch(ctx);
  }
});

bot.on('device_notify', async (ctx) => {
  const deviceId = ctx.from?.id;
  if (!deviceId) return;

  const events = mug.parseNotify(ctx.tal?.notify);
  for (const event of events) {
    if (event.name !== 'CurChargingState') continue;

    const charging = [true, 1, '1'].includes(event.params?.value);

    for (const watch of watches.values()) {
      if (!watch.deviceIds.has(deviceId)) continue;

      await bot.api.sendTextMessage({
        chat: watch.chat,
        to: watch.to,
        mentionOnly: watch.chat.type === 'group',
        text: '像素水杯' + (charging ? '正在充电。' : '已停止充电。'),
      });
    }
  }
});

await bot.setCommands([
  { command: 'bind', description: '关联像素水杯' },
  { command: 'watch', description: '关注充电状态' },
  { command: 'unwatch', description: '停止关注' },
]);

await bot.start();

console.log('设备通知示例已启动。');

async function refreshWatch(ctx) {
  const devices = await bot.getBoundDevices(ctx);

  watches.set(chatKey(ctx.chat), {
    chat: ctx.chat,
    to: ctx.from,
    deviceIds: new Set(devices.map((device) => device.deviceId)),
  });

  return devices.length;
}

function chatKey(chat) {
  return (chat.type || 'chat') + ':' + chat.id;
}