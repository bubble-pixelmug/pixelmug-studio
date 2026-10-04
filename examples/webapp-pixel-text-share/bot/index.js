import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  observeWebAppDeviceCalls: true,
  webAppDeviceAccess: 'any',
  webAppDeviceCallTimeoutMillis: 60_000,
});

bot.on('error', (ctx) => {
  console.error('[webapp-pixel-text-share] Bot 处理失败', {
    event: ctx.event,
    message: ctx.error?.message,
    code: ctx.error?.code,
  });
});

bot.registerDevices([
  createMug('第一个杯子'),
  createMug('第二个杯子'),
]);

bot.on('web_app_device_call:response', async (ctx) => {
  const call = ctx.webAppDeviceCall || {};
  const rpc = ctx.tal?.rpc || call.rpc || {};

  if (rpc.method !== 'talPrintWithRemoteFont') return;

  if (!call.ok) {
    console.warn('[webapp-pixel-text-share] 设备调用失败', {
      id: call.id,
      code: call.code,
      message: call.message,
    });
    return;
  }

  const chat = call.request?.extend?.chat;
  const user = call.request?.extend?.from;
  if (!chat || !user) {
    console.error('[webapp-pixel-text-share] 无法确定操作用户或对话', {
      id: call.id,
    });
    return;
  }

  try {
    const devices = await bot.getBoundDevices({ chat, from: user });
    const device = devices.find(
      (item) => String(item.slotId) === String(call.slotId),
    );
    const userName = user.name || '一位用户';
    const deviceName = device?.name ||
      (device?.slot ? `杯子 ${device.slot}` : '一个杯子');
    const text = rpc.params?.text;
    const message =
      `${userName} 给“${deviceName}”发送了文字：“${text}”。`;

    await ctx.sendText(message, {
      chat,
      to: user,
      mentionOnly: false,
    });

    console.log('[webapp-pixel-text-share] 已发送对话消息', {
      user: userName,
      device: deviceName,
      text,
    });
  } catch (error) {
    console.error('[webapp-pixel-text-share] 发送对话消息失败', {
      id: call.id,
      message: error?.message,
    });
    throw error;
  }
});

bot.on('web_app_device_call:timeout', (ctx) => {
  const call = ctx.webAppDeviceCall || {};

  console.warn('[webapp-pixel-text-share] 设备调用超时', {
    id: call.id,
    method: call.rpc?.method || call.method,
  });
});

bot.on('message', async (ctx) => {
  const text = String(
    ctx.message?.content || ctx.message?.text || '',
  ).trim();
  const command = extractCommand(text);

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: '请关联一台或两台 PixelMug S1 / PixelMug P1。',
      actionButtonTitle: '关联杯子',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('打开文字共享', process.env.STUDIO_WEBAPP_URL);

    await ctx.sendKeyboard('打开 WebApp，给水杯发送文字。', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: '关联像素水杯' },
  { command: 'open', description: '打开文字共享' },
]);

await bot.start();

function extractCommand(text) {
  return String(text).match(/\/[a-zA-Z0-9_-]+/)?.[0] || '';
}

function createMug(name) {
  const mug = new PixelMugS1();
  mug.name = name;
  mug.compatible = ['PixelMug'];
  return mug;
}
