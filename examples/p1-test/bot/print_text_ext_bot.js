import { BubbleBot, isNeedBindDeviceError } from "@jeejio-bubble/bot/sdk/BubbleSDK.js";
import PixelMug, { Specifications } from "@jeejio-bubble/bot/devices/ext/PixelMug_1.1.ext.js";

import { apiBaseUrl, token } from "./config.dev.js";

const PRINT_COLOR = "#00ff00";
const PRINT_SPEED = 80; // the big the slower, the small the faster
// const PRINT_DIRECTION = 0; // still
const PRINT_DIRECTION = 1; // left
// const PRINT_DIRECTION = 2; // right

const bot = new BubbleBot(token, {
  apiBaseUrl,
  debug: true,
  observeWebAppDeviceCalls: false,
  webAppDeviceAccess: "none",
});

const pixelMug = new PixelMug();
pixelMug.compatible = ["PixelMugS1"];
bot.registerDevices([pixelMug]);

bot.on("error", async (ctx) => {
  console.error("[test-pixelmug-print-text-ext-bot]", ctx.error);
});

bot.on("message:bind_device", async (ctx) => {
  console.log("[test-pixelmug-print-text-ext-bot] bind device message:", {
    messageId: ctx.messageId,
    from: ctx.from,
    chat: ctx.chat,
    attachedDevices: ctx.message?.attachedDevices,
  });
});

bot.on("message", async (ctx) => {
  const text = String(ctx.message?.content || ctx.message?.text || "").trim();
  const command = extractCommand(text);

  if (command === "/bind") {
    await ctx.sendBindDevice({
      content: "Bind PixelMug to this chat.",
      actionButtonTitle: "Bind PixelMug",
    });
    return;
  }

  if (!text || command === "/start") {
    await ctx.sendText("Send any text message and I will print it on PixelMug. Use /bind first if needed.");
    return;
  }

  if (!(await bot.isDeviceBound(ctx, pixelMug))) {
    await ctx.sendBindDevice({
      content: "Bind PixelMug before printing text.",
      actionButtonTitle: "Bind PixelMug",
    });
    return;
  }

  try {
    const rpc = await pixelMug.rpc.talPrintText({
      text,
      specifications: Specifications.SMALL,
      color: PRINT_COLOR,
      speed: PRINT_SPEED,
      direction: PRINT_DIRECTION,
    });

    await bot.callDevice(ctx.chat, pixelMug, rpc, {
      to: ctx.from,
      timeout: 30000,
    });
    await ctx.sendText("Sent to PixelMug.");
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await ctx.sendBindDevice({
        content: "Bind PixelMug before printing text.",
        actionButtonTitle: "Bind PixelMug",
      });
      return;
    }

    await ctx.sendText(`PixelMug print failed: ${error.message || error}`);
    throw error;
  }
});

await bot.setCommands([
  {
    command: "bind",
    description: "Bind PixelMug",
  },
  {
    command: "start",
    description: "Show PixelMug print text help",
  },
]);

await bot.start();

console.log("PixelMug ext print text test bot is running. Try /bind, then send any text.");

function extractCommand(text) {
  const match = String(text || "").match(/\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/);
  if (!match) return "";
  return match[0].split("@")[0];
}
