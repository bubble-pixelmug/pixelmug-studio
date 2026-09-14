import { BubbleBot, InlineKeyboard } from "@jeejio-bubble/bot/sdk/BubbleSDK.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("请设置 BOT_TOKEN。无需 token 的日志测试请使用 smoke-bot.js。");
const webAppUrl = process.env.STUDIO_WEBAPP_URL;
if (!webAppUrl) throw new Error("请通过 Studio 启动此示例，Studio 会注入 STUDIO_WEBAPP_URL。");

const bot = new BubbleBot(token, {
  ...(process.env.BOT_API_BASE_URL ? { apiBaseUrl: process.env.BOT_API_BASE_URL } : {}),
  debug: process.env.BOT_SDK_DEBUG === "1",
  observeWebAppDeviceCalls: false,
  webAppDeviceAccess: "none",
});
bot.on("error", async ctx => console.error("bot handler error", ctx.error));
bot.on("message", async ctx => {
  const text = String(ctx.message?.content || ctx.message?.text || "").trim();
  if (!/^\/webapp(?:@\S+)?(?:\s|$)/.test(text)) {
    await ctx.sendText("发送 /webapp 打开 Studio 日志测试页面。");
    return;
  }
  console.log("打开 Studio WebApp", { chatId: ctx.chat?.id });
  await ctx.sendKeyboard("Studio debug demo", new InlineKeyboard().url("打开日志测试", webAppUrl));
});
bot.onWebAppRequest("studio.echo", async ctx => {
  const payload = ctx.webAppData?.payload || {};
  console.log("收到 WebApp 请求", payload);
  if (payload.fail) throw new Error("Demo: bot 请求处理失败");
  const result = { echo: payload.text, requestId: payload.requestId, serverTime: new Date().toISOString() };
  console.log("返回 WebApp 响应", result);
  return result;
});
await bot.setCommands([{ command: "webapp", description: "打开 Studio 日志测试" }]);
await bot.start({ device: false });
console.info("Studio demo bot 已启动，发送 /webapp 体验真实 WebApp ↔ bot 调用。");
