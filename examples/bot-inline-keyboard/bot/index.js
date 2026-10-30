import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
});

const mug = new PixelMugS1();
mug.name = 'PixelMug S1';
mug.compatible = ['PixelMug'];
bot.registerDevices([mug]);

bot.on('error', (ctx) => {
  console.error('[bot-inline-keyboard]', ctx.error?.message || ctx.error);
});

bot.on('message:text', async (ctx) => {
  const command = ctx.message.text.trim();

  if (command === '/bindPixelMug') {
    await ctx.sendBindDevice({
      content: 'Select a PixelMug S1 or PixelMug P1 for this Bot.',
      actionButtonTitle: 'Bind device',
    });
    return;
  }

  if (command !== '/panel') {
    await ctx.sendText('Send /panel to open the action panel.');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('Say hello', 'hello')
    .text('Show time', 'time')
    .row()
    .text('Display on', 'screen:on')
    .text('Display off', 'screen:off')
    .row()
    .url('Open PixelMug website', 'https://pixelmug.com/');

  await ctx.sendKeyboard('**Action panel**\nChoose an action:', keyboard);
});

bot.on('callback', async (ctx) => {
  const data = ctx.callback?.value;
  const action = typeof data === 'string'
    ? data
    : data?.value || data?.data;

  if (action === 'hello') {
    await ctx.sendText(`Hello, ${ctx.from?.name || 'friend'}!`);
  } else if (action === 'time') {
    await ctx.sendText(`Current bot time: ${new Date().toLocaleString('en-US')}`);
  } else if (action === 'screen:on' || action === 'screen:off') {
    // Handle screen on/off actions
    const rpc = mug.rpc.talSetDisplayOnOff({ onoff: action === 'screen:on' });
    await bot.callDevice(ctx.chat, mug, rpc, {
      to: ctx.from,
      requireOnline: true,
      timeout: 10000,
    });
    await ctx.sendText(
      `Display is turned ${action === 'screen:on' ? 'on' : 'off'}`
    );
  } else {
    await ctx.sendText('Send /panel to open the action panel again.');
  }
});

await bot.setCommands([
  { command: 'panel', description: 'Open the action panel' },
  { command: 'bindPixelMug', description: 'Bind a PixelMug device' },
]);

await bot.start();

console.log('Inline keyboard example started.');
