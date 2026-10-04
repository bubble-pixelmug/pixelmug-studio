import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });

bot.on('error', (ctx) => {
  console.error('[bot-first-bot]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  await ctx.replyText('收到：' + ctx.message.text);
});

await bot.start({ device: false });

console.log('第一个 Bot 已启动，请在冒泡 App 中发送文字。');