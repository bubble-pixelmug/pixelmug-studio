import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const bot = new BubbleBot(process.env.BOT_TOKEN, {
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
      content: '请选择一台 PixelMug S1，用于安装并运行本示例的 MPY 脚本。',
      actionButtonTitle: '关联 PixelMug',
    });
  } else if (command === '/help') {
    await ctx.sendText([
      '这是一个演示 PixelMugBLECentral 主机库的示例。',
      'Bot 只负责关联 PixelMug，并配合 Studio 安装和运行 mpy/ 中的设备脚本。',
      '发送 /bind 选择测试用的 PixelMug S1。',
    ].join('\n'));
  }
});

await bot.setCommands([
  { command: 'bind', description: '关联测试用 PixelMug' },
  { command: 'help', description: '查看示例说明' },
]);

await bot.start();

function extractCommand(text) {
  const match = String(text).match(
    /\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/,
  );
  return match?.[0].split('@')[0] || '';
}
