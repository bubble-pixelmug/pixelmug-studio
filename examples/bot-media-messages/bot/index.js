import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BubbleBot } from '@jeejio-bubble/bot/sdk';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

const assetsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'assets',
);
const uploads = new Map();

function upload(name) {
  if (!uploads.has(name)) {
    const filePath = path.join(assetsDir, name);
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
    await ctx.sendText('Send /image, /voice, /video, or /gif.');
  }
});

bot.on('message:image', async (ctx) => {
  const image = ctx.message.image;
  await ctx.sendText(
    `Received an image: ${image?.width || '?'} x ${image?.height || '?'}`,
  );
});

bot.on('message:voice', async (ctx) => {
  await ctx.sendText(
    `Received a voice message: ${ctx.message.voice?.duration || 0} ms`,
  );
});

bot.on('message:video', async (ctx) => {
  const video = ctx.message.video;
  await ctx.sendText(
    `Received a video: ${video?.width || '?'} x ${video?.height || '?'}`,
  );
});

bot.on('message:gif', async (ctx) => {
  await ctx.sendText('Received a GIF.');
});

await bot.setCommands([
  { command: 'image', description: 'Send a sample image' },
  { command: 'voice', description: 'Send a sample voice message' },
  { command: 'video', description: 'Send a sample video' },
  { command: 'gif', description: 'Send a sample GIF' },
]);

await bot.start({ device: false });

console.log('Media messages example started.');
