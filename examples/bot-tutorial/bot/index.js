import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import { InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;
if (!token || !apiBaseUrl) {
  throw new Error('请配置 BOT_TOKEN 和 BOT_API_BASE_URL');
}

const bot = new BubbleBot(token, { apiBaseUrl });

const mug = new PixelMugS1();
bot.registerDevices([mug]);

async function askToBind(ctx) {
  await ctx.sendBindDevice({
    content: '请先关联 PixelMug S1。',
    actionButtonTitle: '关联 S1',
  });
}

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();
  if (command === '/bind') {
    await askToBind(ctx);
    return;
  }
  if (command !== '/panel') {
    await ctx.sendText('发送 /bind 关联设备，发送 /panel 打开屏幕控制。');
    return;
  }
  const keyboard = new InlineKeyboard()
    .text('亮屏', 'screen:on')
    .text('息屏', 'screen:off');
  await ctx.sendKeyboard('**S1 屏幕控制**', keyboard);
});

bot.on('callback', async (ctx) => {
  const data = ctx.callback?.value;
  const action = typeof data === 'string' ? data : data?.value || data?.data;
  if (action !== 'screen:on' && action !== 'screen:off') return;

  try {
    const rpc = mug.rpc.talSetDisplayOnOff({ onoff: action === 'screen:on' });
    await bot.callDevice(ctx.chat, mug, rpc, {
      to: ctx.from,
      requireOnline: true,
      timeout: 10000,
    });
    await ctx.sendText('设备已返回成功响应。');
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await askToBind(ctx);
      return;
    }
    await ctx.sendText(`屏幕操作未确认成功：${error.message}`);
  }
});

await bot.start({ device: false });
console.log('Bot 已启动，请在冒泡 App 中测试');

function shutdown() {
  bot.stop();
  bot.clearQueues();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);