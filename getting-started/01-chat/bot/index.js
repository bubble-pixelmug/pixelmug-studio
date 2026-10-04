import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMug from '@jeejio-bubble/bot/devices/pixelmug/ext';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});
const mug = new PixelMug();
mug.compatible = ['PixelMugS1'];
bot.registerDevices([mug]);

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '/help') {
    await ctx.sendText('这是一个最简单的 PixelMug Bot：发送文字，Bot 会让 PixelMug 显示它。\n\n使用 /bindPixelMug 关联设备。');
    return;
  }

  if (text === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: '请选择要关联的 PixelMug。',
      actionButtonTitle: '关联 PixelMug',
    });
    return;
  }

  if (!(await bot.isDeviceBound(ctx, mug))) {
    await ctx.sendBindDevice({ content: '先关联你的 PixelMug，再发一句话吧。' });
    return;
  }
  if (!text) return;
  try {
    const rpc = await mug.rpc.talPrintText({ text, color: '#00ff00', speed: 80 });
    await bot.callDevice(ctx.chat, mug, rpc);
    await ctx.sendText(`杯子收到啦：${text}`);
  } catch (error) {
    await ctx.sendText(`显示失败：${error.message}`);
  }
});

bot.on('error', (ctx) => console.error(ctx.error.message));

await bot.setCommands([
  { command: 'help', description: '了解这个 Bot 的使用方法' },
  { command: 'bindPixelMug', description: '关联你的 PixelMug' },
]);
await bot.start();
