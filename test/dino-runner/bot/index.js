import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BubbleBot, InlineKeyboard } from "@jeejio-bubble/bot/sdk";
import PixelMugS1 from "@jeejio-bubble/bot/devices/pixelmug-s1/ext";
const token = requiredEnv("BOT_TOKEN");
const apiBaseUrl = process.env.BOT_API_BASE_URL || "https://us.jeejio.com/im";
const mpsID = requiredEnv("STUDIO_MPS_ID");
const mpsVersion = requiredEnv("STUDIO_MPS_VERSION");

const staticPort = Number(process.env.WEBAPP_PORT || 8799);
const webAppHost = process.env.WEBAPP_HOST || localAddressHint();
const generatedWebAppUrl = `http://${webAppHost}:${staticPort}/index.html`;
const mpsLaunchConfig = {
  id: mpsID, 
  version: mpsVersion,
};
const webAppUrl = withMpsLaunchConfig(process.env.STUDIO_WEBAPP_URL || process.env.WEBAPP_URL || generatedWebAppUrl);
// The cloud deployment supplies the public URL, but this same container still
// serves the built WebApp on port 8799. Set SERVE_WEBAPP=false only when the
// WebApp is hosted by a separate service.
const shouldServeStatic = process.env.SERVE_WEBAPP !== "false";

const messages = {
  "en-US": {
    bindContent: "Bind a PixelMug before running Dino Runner.",
    bindButton: "Bind PixelMug",
    addedIntro: "Hello, I am the Dino Runner game agent. I let you control a tiny pixel dinosaur on PixelMug.",
    openButton: "Open Dino Runner",
    intro: "**Dino Runner**\\n\\nLaunch a tiny pixel dino on PixelMug, jump with your phone or the mug touch key, and dodge obstacles.\\n\\nTap the button below to start.",
    commands: "Commands: /bindDevice, /dinoRunner",
    commandBind: "Bind PixelMug",
    commandDino: "Open Dino Runner",
  },
  "zh-CN": {
    bindContent: "运行恐龙跑酷前，请先绑定 PixelMug。",
    bindButton: "绑定 PixelMug",
    addedIntro: "你好，我是恐龙跑酷游戏 Bot，可以让你在 PixelMug 上运行像素恐龙。",
    openButton: "打开恐龙跑酷",
    intro: "**恐龙跑酷**\\n\\n在 PixelMug 上启动像素恐龙，用手机或杯子的触摸按键控制跳跃。\\n\\n点击下面的按钮开始。",
    commands: "可用命令：/bindDevice、/dinoRunner",
    commandBind: "绑定 PixelMug",
    commandDino: "打开恐龙跑酷",
  },
};
const pixelMug = new PixelMugS1();
const bot = new BubbleBot(token, {
  apiBaseUrl,
  debug: process.env.DEBUG !== "false",
  observeWebAppDeviceCalls: true,
  webAppDeviceAccess: "any",
});

bot.registerDevices([pixelMug]);

bot.on("error", async (ctx) => {
  console.error("[dino-runner-bot]", ctx.error || ctx);
});

bot.on("web_app_data", async (ctx) => {
  const data = ctx.webAppData || {};
  if (data.type !== "app.dinoBestScore") return;

  const payload = data.payload || {};
  const user = userInfoFromContext(ctx);
  const bestScore = Number(payload.bestScore || 0);

  console.log(`[dino-runner-bot] user ${user.username || user.userId || "unknown"} scored best=${bestScore}`, {
    userId: user.userId,
    username: user.username,
    bestScore,
    lastScore: Number(payload.lastScore || payload.score || 0),
    score: Number(payload.score || 0),
    reason: payload.reason,
    reportedAt: payload.reportedAt,
  });
});

bot.on("web_app_device_call", async (ctx) => {
  const call = ctx.webAppDeviceCall || {};
  console.log("[dino-runner-bot] WebApp device call", {
    direction: call.direction,
    method: call.method,
    slotId: call.slotId,
    deviceId: call.deviceId,
    result: call.result,
  });
});

bot.on("device_notify", async (ctx) => {
  const rawEvents = ctx.tal?.notify || [];
  const parsedEvents = pixelMug.parseNotify(rawEvents);
  console.log("[dino-runner-bot] Device notify", {
    deviceId: ctx.from?.id,
    rawEvents,
    parsedEvents,
  });
});

bot.on("contact_added", async (ctx) => {
  await sendAddedIntro(ctx);
});

bot.on("joined_group", async (ctx) => {
  await sendAddedIntro(ctx, { mentionOnly: false });
});

bot.on("message", async (ctx) => {
  const locale = localeFromContext(ctx);
  const command = extractCommand(ctx.message?.content || ctx.message?.text || "");

  if (command === "/bindDevice") {
    await sendBindDevice(ctx, locale);
    return;
  }

  if (command === "/dinoRunner" || command === "/webapp" || command === "/start") {
    const keyboard = new InlineKeyboard().url(text(locale, "openButton"), withLocale(webAppUrl, locale));
    await ctx.sendKeyboard(
      text(locale, "intro"),
      keyboard,
      {
        mentionOnly: ctx.chat?.type === "group" ? true : undefined,
      }
    );
    return;
  }

  await ctx.sendText(text(locale, "commands"));
});

if (shouldServeStatic) {
  await startStaticServer();
}

await bot.setCommands([
  {
    command: "bindDevice",
    description: messages["en-US"].commandBind,
    descTranslations: {
      "zh-CN": messages["zh-CN"].commandBind,
      en: messages["en-US"].commandBind,
    },
  },
  {
    command: "dinoRunner",
    description: messages["en-US"].commandDino,
    descTranslations: {
      "zh-CN": messages["zh-CN"].commandDino,
      en: messages["en-US"].commandDino,
    },
  },
]);

await bot.start();

console.log("mps-dino-runner bot is running.");
console.log(`WebApp URL: ${webAppUrl}`);

function userInfoFromContext(ctx) {
  const from = ctx.from || {};
  return {
    userId: from.id || from.userId || (typeof ctx.from === "string" ? ctx.from : undefined),
    username: from.username || from.userName || from.name || from.nickName || from.nickname,
  };
}

function extractCommand(text) {
  const match = String(text || "").trim().match(/\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/);
  if (!match) return "";
  return match[0].split("@")[0];
}

function localeFromContext(ctx) {
  const value = ctx.chat?.language || ctx.from?.language || process.env.APP_LOCALE;
  return normalizeLocale(value);
}

function normalizeLocale(value) {
  const source = String(value || "").toLowerCase();
  return source.startsWith("zh") ? "zh-CN" : "en-US";
}

function text(locale, key) {
  return messages[locale]?.[key] || messages["en-US"][key] || key;
}

function sendAddedIntro(ctx, options = {}) {
  const locale = localeFromContext(ctx);
  return ctx.sendBindDevice({
    content: text(locale, "addedIntro"),
    actionButtonTitle: text(locale, "bindButton"),
    ...options,
  });
}

function sendBindDevice(ctx, locale = localeFromContext(ctx)) {
  return ctx.sendBindDevice({
    content: text(locale, "bindContent"),
    actionButtonTitle: text(locale, "bindButton"),
  });
}

async function startStaticServer() {
  const distRoot = await resolveWebAppRoot();

  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const filePath = normalize(join(distRoot, decodeURIComponent(pathname)));
      const rel = relative(distRoot, filePath);

      if (rel.startsWith("..")) {
        sendStatus(res, 403, "Forbidden");
        return;
      }

      const info = await stat(filePath);
      if (!info.isFile()) {
        sendStatus(res, 404, "Not found");
        return;
      }

      res.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store",
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      const message = String(error?.code || error?.message || error);
      if (message.includes("ENOENT")) {
        sendStatus(res, 404, "Build not found. Run npm run build first.");
        return;
      }
      sendStatus(res, 404, "Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(staticPort, "0.0.0.0", () => {
      server.off("error", reject);
      console.log(`Static WebApp server listening on http://0.0.0.0:${staticPort}`);
      resolve(server);
    });
  });
}

async function resolveWebAppRoot() {
  const builtRoot = fileURLToPath(new URL("../webapp/dist", import.meta.url));
  try {
    const info = await stat(builtRoot);
    if (info.isDirectory()) return builtRoot;
  } catch {}
  return fileURLToPath(new URL("../webapp", import.meta.url));
}
function sendStatus(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function withMpsLaunchConfig(url) {
  const next = new URL(url);
  next.searchParams.set("mps_id", mpsLaunchConfig.id);
  next.searchParams.set("mps_version", mpsLaunchConfig.version);
  return next.toString();
}

function withLocale(url, locale) {
  const next = new URL(url);
  next.searchParams.set("lang", locale);
  return next.toString();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function localAddressHint() {
  return process.env.HOST || "127.0.0.1";
}






