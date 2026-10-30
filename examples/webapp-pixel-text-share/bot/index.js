import {
  BubbleBot,
  InlineKeyboard,
} from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error('WebApp URL is not configured');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  observeWebAppDeviceCalls: true,
  webAppDeviceAccess: 'any',
  webAppDeviceCallTimeoutMillis: 60_000,
});

bot.on('error', (ctx) => {
  console.error('[webapp-pixel-text-share] Bot operation failed', {
    event: ctx.event,
    message: ctx.error?.message,
    code: ctx.error?.code,
  });
});

bot.registerDevices([
  createMug('First mug'),
  createMug('Second mug'),
]);

bot.on('web_app_device_call:response', async (ctx) => {
  const call = ctx.webAppDeviceCall || {};
  const rpc = call.rpc || {};

  if (rpc.method !== 'talPrintWithRemoteFont') return;

  if (!call.ok) {
    console.warn('[webapp-pixel-text-share] Device call failed', {
      id: call.id,
      code: call.code,
      message: call.message,
    });
    return;
  }

  const chat = call.request?.extend?.chat;
  const user = call.request?.extend?.from;
  if (!chat || !user) {
    console.error('[webapp-pixel-text-share] Could not identify the user or chat', {
      id: call.id,
    });
    return;
  }

  try {
    const devices = await bot.getBoundDevices({ chat, from: user });
    const device = devices.find(
      (item) => String(item.slotId) === String(call.slotId),
    );
    const userName = user.name || 'A user';
    const deviceName = device?.name ||
      (device?.slot ? `Mug ${device.slot}` : 'A mug');
    const text = rpc.params?.text;
    const message =
      `${userName} sent “${text}” to “${deviceName}”.`;

    await ctx.sendText(message, {
      chat,
      to: user,
      mentionOnly: false,
    });

    console.log('[webapp-pixel-text-share] Chat message sent', {
      user: userName,
      device: deviceName,
      text,
    });
  } catch (error) {
    console.error('[webapp-pixel-text-share] Failed to send chat message', {
      id: call.id,
      message: error?.message,
    });
    throw error;
  }
});

bot.on('web_app_device_call:timeout', (ctx) => {
  const call = ctx.webAppDeviceCall || {};

  console.warn('[webapp-pixel-text-share] Device call timed out', {
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
      content: 'Bind one or two PixelMug S1 or PixelMug P1 devices.',
      actionButtonTitle: 'Bind mugs',
    });
    return;
  }

  if (command === '/open') {
    const keyboard = new InlineKeyboard()
      .url('Open Text Share', webAppUrl);

    await ctx.sendKeyboard('Open the WebApp and send text to a mug.', keyboard);
  }
});

await bot.setCommands([
  { command: 'bind', description: 'Bind PixelMug devices' },
  { command: 'open', description: 'Open Text Share' },
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
