import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, {
  apiBaseUrl,
  group_policy: 'mention',
});

bot.on('error', (ctx) => {
  console.error('[bot-commands-and-groups]', ctx.error?.message || ctx.error);
});

bot.on('joined_group', async (ctx) => {
  await ctx.sendText('大家好，请在群聊中 @我并发送 /help。', {
    mentionOnly: false,
  });
});

bot.on('message', async (ctx) => {
  const text = String(
    ctx.message?.content || ctx.message?.text || '',
  );
  const command = extractCommand(text);

  if (command === '/help') {
    await ctx.sendText('使用 /whoami 查看上下文，/announce 向整个群发消息。');
  } else if (command === '/whoami') {
    await ctx.sendText([
      '对话：' + (ctx.chat?.name || ctx.chat?.id || '未知'),
      '类型：' + (ctx.chat?.type || '未知'),
      '发送者：' + (ctx.from?.name || ctx.from?.id || '未知'),
    ].join('\n'));
  } else if (command === '/announce') {
    await ctx.sendText('这是一条群内所有成员都可见的消息。', {
      mentionOnly: false,
    });
  }
});

await bot.setCommands([
  { command: 'help', description: '查看帮助' },
  { command: 'whoami', description: '查看当前上下文' },
  { command: 'announce', description: '发送群内可见消息' },
]);

await bot.start({ device: false });

console.log('命令与群聊示例已启动。');

function extractCommand(text) {
  const match = String(text).match(
    /\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/,
  );
  return match?.[0].split('@')[0] || '';
}
