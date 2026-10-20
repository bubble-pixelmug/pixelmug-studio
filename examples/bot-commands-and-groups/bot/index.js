import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const bot = new BubbleBot(requiredEnv('BOT_TOKEN'), {
  apiBaseUrl: requiredEnv('BOT_API_BASE_URL'),
  group_policy: 'mention',
});

bot.on('error', (ctx) => {
  console.error('[bot-commands-and-groups]', ctx.error?.message || ctx.error);
});

bot.on('joined_group', async (ctx) => {
    await ctx.sendText('Hello! Mention me in this group and send /help to see the available commands.', {
    mentionOnly: false,
  });
});

bot.on('message', async (ctx) => {
  const text = String(
    ctx.message?.content || ctx.message?.text || '',
  );
  const command = extractCommand(text);

  if (command === '/help') {
    await ctx.sendText('Use /whoami to inspect the current context, or /announce to send a message visible to the whole group.');
  } else if (command === '/whoami') {
    await ctx.sendText([
      'Chat: ' + (ctx.chat?.name || ctx.chat?.id || 'Unknown'),
      'Type: ' + (ctx.chat?.type || 'Unknown'),
      'Sender: ' + (ctx.from?.name || ctx.from?.id || 'Unknown'),
    ].join('\n'));
  } else if (command === '/announce') {
    await ctx.sendText('This message is visible to everyone in the group.', {
      mentionOnly: false,
    });
  }
});

await bot.setCommands([
  { command: 'help', description: 'Show help' },
  { command: 'whoami', description: 'Show the current context' },
  { command: 'announce', description: 'Send a group-visible message' },
]);

await bot.start({ device: false });

console.log('Bot commands and groups example started.');

function extractCommand(text) {
  const match = String(text).match(
    /\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/,
  );
  return match?.[0].split('@')[0] || '';
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
