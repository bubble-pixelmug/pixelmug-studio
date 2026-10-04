import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });

bot.on('error', (ctx) => {
  console.error('[bot-message-events]', ctx.error?.message || ctx.error);
});

bot.use(async (ctx, next) => {
  const started = Date.now();

  try {
    await next();
    console.log(
      '[' + ctx.event + '] 处理完成，耗时 ' + (Date.now() - started) + ' ms',
    );
  } catch (error) {
    console.error('[' + ctx.event + '] 处理失败', error);
    throw error;
  }
});

bot.on('message:text', async (ctx, next) => {
  if (ctx.message.text.trim() === '/help') {
    await ctx.sendText('发送任意文字，观察处理链的执行顺序。');
    return;
  }

  console.log('message:text 处理器先收到文字消息');
  await next();
});

bot.on('message', async (ctx) => {
  if (!ctx.message?.text) return;

  const sender = ctx.from?.name || '朋友';
  await ctx.sendText(
    sender + '，通用 message 处理器收到：' + ctx.message.text,
  );
});

await bot.start({ device: false });

console.log('事件处理链示例已启动。');