import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });

bot.on('error', (ctx) => {
  console.error('[bot-inline-keyboard]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.trim() !== '/panel') {
    await ctx.sendText('发送 /panel 打开操作面板。');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('打招呼', 'hello')
    .text('查看时间', 'time')
    .row()
    .url('打开 PixelMug 网站', 'https://pixelmug.com/');

  await ctx.sendKeyboard('**操作面板**\n请选择一个操作：', keyboard);
});

bot.on('callback', async (ctx) => {
  const data = ctx.callback?.value;
  const action = typeof data === 'string'
    ? data
    : data?.value || data?.data;

  if (action === 'hello') {
    await ctx.sendText('你好，' + (ctx.from?.name || '朋友') + '！');
  } else if (action === 'time') {
    await ctx.sendText(
      'Bot 当前时间：' + new Date().toLocaleString('zh-CN'),
    );
  } else {
    await ctx.sendText('请重新发送 /panel 打开操作面板。');
  }
});

await bot.start({ device: false });

console.log('InlineKeyboard 示例已启动。');