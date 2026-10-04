import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.BOT_API_BASE_URL;

if (!token || !apiBaseUrl) {
  throw new Error('请配置 Bot token 和 API 地址');
}

const bot = new BubbleBot(token, { apiBaseUrl });
const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const uploads = new Map();

function upload(name) {
  if (!uploads.has(name)) {
    const filePath = path.join(projectDir, 'assets', name);
    uploads.set(name, bot.inputFile(filePath));
  }
  return uploads.get(name);
}

bot.on('error', (ctx) => {
  console.error('[bot-media-messages]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/image') {
    const image = await upload('photo.png');
    await ctx.sendImage({ ...image, width: 1160, height: 904 });
  } else if (command === '/voice') {
    const voice = await upload('iphone.ogg');
    await ctx.sendVoice(voice, { duration: 1874 });
  } else if (command === '/video') {
    const video = await upload('pixelmug.mp4');
    const thumb = await upload('cover.png');
    await ctx.sendVideo(video, {
      thumb,
      width: 960,
      height: 720,
      duration: 10000,
    });
  } else if (command === '/gif') {
    const gif = await upload('game.gif');
    await ctx.sendGif({ ...gif, width: 32, height: 16 });
  } else {
    await ctx.sendText('发送 /image、/voice、/video 或 /gif。');
  }
});

bot.on('message:image', async (ctx) => {
  const image = ctx.message.image;
  await ctx.sendText(
    '收到图片：' + (image?.width || '?') + ' × ' + (image?.height || '?'),
  );
});

bot.on('message:voice', async (ctx) => {
  await ctx.sendText(
    '收到语音：' + (ctx.message.voice?.duration || 0) + ' 毫秒',
  );
});

bot.on('message:video', async (ctx) => {
  const video = ctx.message.video;
  await ctx.sendText(
    '收到视频：' + (video?.width || '?') + ' × ' + (video?.height || '?'),
  );
});

bot.on('message:gif', async (ctx) => {
  await ctx.sendText('收到 GIF。');
});

await bot.setCommands([
  { command: 'image', description: '发送示例图片' },
  { command: 'voice', description: '发送示例语音' },
  { command: 'video', description: '发送示例视频' },
  { command: 'gif', description: '发送示例 GIF' },
]);

await bot.start({ device: false });

console.log('媒体消息示例已启动。');