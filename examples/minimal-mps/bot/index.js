import { BubbleBot, InlineKeyboard } from "../../../../../mps/jeejio-bubble/sdk/BubbleSDK.js";
import PixelMugS1 from "../../../../../mps/jeejio-bubble/devices/ext/PixelMugS1_1.0.ext.js";
if (!process.env.BOT_TOKEN) throw new Error("请设置 BOT_TOKEN");
const bot = new BubbleBot(process.env.BOT_TOKEN, {
  ...(process.env.BOT_API_BASE_URL ? { apiBaseUrl: process.env.BOT_API_BASE_URL } : {}),
  webAppDeviceAccess: "any",
  debug: true,
});
bot.registerDevices([new PixelMugS1()]);
bot.on("error", ctx => console.error("bot error", ctx.error));
bot.on("device_notify", ctx => console.log("Device event", ctx.tal?.notify));
bot.on("device_call:response", ctx => console.log("Async RPC response", ctx.deviceCall?.result));
bot.on("device_call:error", ctx => console.error("Async RPC error", ctx.error));
bot.on("message", async ctx => {
  const text = String(ctx.message?.content || ctx.message?.text || "").trim();
  const command = text.split(/\s+/)[0].split("@")[0];
  console.log("[minimal-mps] Command received:", command);
  if (command === "/bind") { await ctx.sendBindDevice({ content: "绑定测试 PixelMug" }); return; }
  if (command === "/webapp") {
    await ctx.sendKeyboard("Studio 真机加载测试", new InlineKeyboard().url("打开测试页面", process.env.STUDIO_WEBAPP_URL));
    return;
  }
  const devices = await bot.getBoundDevices(ctx);
  if (command === "/devices") {
    await ctx.sendText(JSON.stringify(devices.map(d => ({ deviceId: d.deviceId, slotId: d.slotId, name: d.name })), null, 2));
    return;
  }
  if (command === "/run" || command === "/runasync") {
    const requested = text.split(/\s+/)[1];
    const device = requested ? devices.find(d => d.deviceId === requested) : devices[0];
    if (!device) { await ctx.sendText("没有绑定设备，先 /bind；多设备可用 /run <deviceId>。"); return; }
    // Deliberately empty: Studio uses local mpy/, ignoring MPS id/version.
    const rpc = { method: "talMpyExecOneScript", params: { id: "", version: "" } };
    const result = command === "/run"
      ? await bot.callDevice(ctx.chat, device, rpc, { to: ctx.from })
      : await bot.callDeviceAsync(ctx.chat, device, rpc, { to: ctx.from });
    console.log("Launch accepted", command === "/run" ? result.tal.result : result.traceId);
    await ctx.sendText("调试启动已受理，请在 Studio 查看部署进度和 MPY 日志。");
    return;
  }
  await ctx.sendText("命令：/bind /devices /webapp /run /runasync");
});
console.log("[minimal-mps] Bot API:", bot.api.baseUrl, "group policy:", bot.groupPolicy);
await bot.start();
console.log("[minimal-mps] Polling started; awaiting messages. Send /devices or /webapp. In groups, mention the bot.");

