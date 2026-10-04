import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});
const mug = new PixelMugS1();
bot.registerDevices([mug]);
const pendingInstalls = new Map();

async function finishInstall(deviceId, message) {
  const pending = pendingInstalls.get(deviceId);
  if (!pending) return;
  pendingInstalls.delete(deviceId);
  clearTimeout(pending.timer);
  await pending.ctx.sendText(message);
}

bot.on('device_notify', async (ctx) => {
  const deviceId = String(ctx.from?.id || '');
  for (const event of mug.parseNotify(ctx.tal?.notify || [])) {
    const value = event.params?.value;
    if (event.name === 'mpyVmError') {
      await finishInstall(deviceId, `设备程序错误：${typeof value === 'string' ? value : JSON.stringify(value)}`);
    } else if (event.name === 'mpyVmEvent') {
      if (value === 'MPS_IS_RUNNING') await finishInstall(deviceId, 'MPY 已在 PixelMug 上运行，可以开始体验了。');
      if (value === 'INSTALL_FAIL') await finishInstall(deviceId, 'MPY 安装失败，请查看 Studio 的设备日志。');
      if (value === 'RUNNING_FAIL') await finishInstall(deviceId, 'MPY 运行失败，请查看 Studio 的设备日志。');
    }
  }
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/help') {
    await ctx.sendText('在 PixelMug S1 上体验不同的 MPY 应用。\n\n使用 /bindPixelMug 关联设备。将示例文件夹里的全部源文件复制到项目的 mpy/，再发送 /installMPY 安装并运行。默认示例显示 BTC/USD 行情，无需 WebApp。');
    return;
  }

  if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择要关联的 PixelMug S1。',
      actionButtonTitle: '关联 PixelMug',
    });
    return;
  }

  if (text === '/installMPY') {
    const [device] = await bot.getBoundDevices(ctx);
    if (!device) {
      await ctx.sendBindDevice({ content: '请先关联一台 PixelMug S1，再安装 MPY。' });
      return;
    }
    const deviceId = String(device.deviceId);
    if (pendingInstalls.has(deviceId)) {
      await ctx.sendText('设备正在安装或启动，请等待结果。');
      return;
    }
    // 先记录请求再调用 RPC，避免遗漏快速到达的运行事件。
    const pending = { ctx };
    pendingInstalls.set(deviceId, pending);
    pending.timer = setTimeout(() => {
      finishInstall(deviceId, '等待设备运行上报超时，请在 Studio 查看设备状态后重试。').catch(console.error);
    }, 120000);
    pending.timer.unref?.();
    try {
      await ctx.sendText('正在安装并启动 MPY，请稍候 ⏳');
      // Studio 接管此 RPC，使用当前项目的 mpy/，无需填写线上 MPS 标识。
      const command = mug.rpc.talMpyExecOneScript({ id: '', version: '' });
      const response = await bot.callDevice(ctx.chat, device, command);
      if (pendingInstalls.get(deviceId) !== pending) return;
      const result = response.tal?.result;
      const value = result?.result ?? result;
      const code = Number(value?.value ?? value?.return ?? value);
      if (code === 264) {
        await finishInstall(deviceId, 'MPY 已经在 PixelMug 上运行，可以开始体验了 ✅');
      } else if ([260, 261, 262, 263, 265].includes(code)) {
        await ctx.sendText('安装请求已接受，正在等待设备运行结果 ⏳');
      } else {
        await finishInstall(deviceId, `设备未接受启动请求，返回码：${code}。请查看 Studio 的设备日志。`);
      }
    } catch (error) {
      if (pendingInstalls.get(deviceId) === pending) await finishInstall(deviceId, `安装失败：${error.message}`);
    }
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));
await bot.setCommands([
  { command: 'help', description: '体验不同的 MPY 应用' },
  { command: 'bindPixelMug', description: '关联你的 PixelMug' },
  { command: 'installMPY', description: '安装并运行当前 MPY 示例' },
]);
await bot.start();
