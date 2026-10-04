import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const messages = {
  'zh-CN': {
    welcome: '你好！我会根据当前对话的语言回复。',
    hello: '你好，很高兴认识你！',
    language: '当前使用的语言是：{locale}',
    help: '发送 /hello 获取问候，发送 /language 查看当前语言。',
  },
  ja: {
    welcome: 'こんにちは！現在のチャットの言語に合わせて返信します。',
    hello: 'こんにちは、お会いできてうれしいです！',
    language: '現在使用している言語：{locale}',
    help: '/hello で挨拶し、/language で現在の言語を確認できます。',
  },
  'en-US': {
    welcome: 'Hello! I reply in the language of the current chat.',
    hello: 'Hello, nice to meet you!',
    language: 'Current language: {locale}',
    help: 'Send /hello for a greeting or /language to see the language.',
  },
};

const bot = new BubbleBot(token, { apiBaseUrl });

bot.on('error', (ctx) => {
  console.error('[bot-i18n]', ctx.error?.message || ctx.error);
});

bot.on('contact_added', async (ctx) => {
  await ctx.sendText(getText(ctx, 'welcome'));
});

bot.on('joined_group', async (ctx) => {
  await ctx.sendText(getText(ctx, 'welcome'), {
    mentionOnly: false,
  });
});

bot.on('message:text', async (ctx) => {
  const command = extractCommand(ctx.message.text);
  const locale = localeFromContext(ctx);

  if (command === '/hello') {
    await ctx.sendText(text(locale, 'hello'));
  } else if (command === '/language') {
    const message = text(locale, 'language');
    await ctx.sendText(message.replace('{locale}', locale));
  } else {
    await ctx.sendText(text(locale, 'help'));
  }
});

await bot.setCommands([
  {
    command: 'hello',
    description: 'Say hello',
    descTranslations: {
      'zh-CN': '打个招呼',
      ja: '挨拶する',
      en: 'Say hello',
    },
  },
  {
    command: 'language',
    description: 'Show current language',
    descTranslations: {
      'zh-CN': '查看当前语言',
      ja: '現在の言語を表示',
      en: 'Show current language',
    },
  },
]);

await bot.start({ device: false });

console.log('国际化 Bot 示例已启动。');

function localeFromContext(ctx) {
  const language = String(
    ctx.chat?.language || ctx.from?.language || '',
  ).toLowerCase();

  if (language.startsWith('zh')) return 'zh-CN';
  if (language.startsWith('ja')) return 'ja';
  return 'en-US';
}

function text(locale, key) {
  return messages[locale]?.[key] || messages['en-US'][key] || key;
}

function getText(ctx, key) {
  return text(localeFromContext(ctx), key);
}

function extractCommand(value) {
  const match = String(value || '')
    .trim()
    .match(/\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/);

  return match ? match[0].split('@')[0] : '';
}