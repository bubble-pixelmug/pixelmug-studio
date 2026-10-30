import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const mpsId = process.env.STUDIO_MPS_ID;
if (!mpsId) throw new Error('STUDIO_MPS_ID is required');

const mpsVersion = process.env.STUDIO_MPS_VERSION;
if (!mpsVersion) throw new Error('STUDIO_MPS_VERSION is required');

const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  group_policy: 'mention',
});

const pixelMug = new PixelMugS1();
bot.registerDevices([pixelMug]);

bot.on('error', (ctx) => {
  console.error('[ble-custom-client-lib]', ctx.error?.message || ctx.error);
});

bot.on('message', async (ctx) => {
  const command = extractCommand(
    ctx.message?.content || ctx.message?.text || '',
  );

  if (command === '/bind') {
    await ctx.sendBindDevice({
      content: 'Select a PixelMug S1 for this MPY example.',
      actionButtonTitle: 'Bind PixelMug',
    });
    return;
  }

  if (command === '/installMPY') {
    const [device] = await bot.getBoundDevices(ctx);
    if (!device) {
      await ctx.sendBindDevice({
        content: 'Bind a PixelMug S1 before installing MPY.',
        actionButtonTitle: 'Bind PixelMug',
      });
      return;
    }

    try {
      await ctx.sendText('Installing and starting MPY. Please wait.');
      const commandRpc = pixelMug.rpc.talMpyExecOneScript({
        id: mpsId,
        version: mpsVersion,
      });
      const response = await bot.callDevice(ctx.chat, device, commandRpc);
      const code = readMpyReturnCode(response);
      if (code === 264) {
        await ctx.sendText('MPY is already running on the PixelMug.');
      } else if ([260, 261, 262, 263, 265].includes(code)) {
        await ctx.sendText('MPY installation started. Wait for the device to finish.');
      } else {
        await ctx.sendText(`The device rejected the MPY request (code ${code}).`);
      }
    } catch (error) {
      await ctx.sendText(`MPY installation failed: ${error.message}`);
    }
    return;
  }

  if (command === '/help') {
    await ctx.sendText([
      'This example demonstrates the PixelMugBLECentral host library.',
      'The Bot binds a PixelMug and installs the device script from mpy/.',
      'Use /bind to select a PixelMug S1, then /installMPY to install and start MPY.',
    ].join('\n'));
  }
});

await bot.setCommands([
  { command: 'bind', description: 'Bind a test PixelMug' },
  { command: 'installMPY', description: 'Install and start MPY' },
  { command: 'help', description: 'Show example instructions' },
]);

await bot.start();

function extractCommand(text) {
  const match = String(text).match(
    /\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/,
  );
  return match?.[0].split('@')[0] || '';
}

function readMpyReturnCode(response) {
  const result = response?.tal?.result ?? response?.result;
  const value = result && typeof result === 'object'
    ? result.value ?? result.return ?? result.result?.value ?? result.result
    : result ?? response?.value;
  return Number(value);
}
