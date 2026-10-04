// PixelMug UDP effect caster: generate 32x16 frames and send them to the device.
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EFFECTS, HEIGHT, WIDTH, createEffect } from "./effects.mjs";

const HTTP_PORT = Number.parseInt(process.env.HTTP_PORT || "8080", 10);
const HOST = "0.0.0.0";
const DEFAULT_UDP_PORT = 9001;
const FPS = 30;
const FRAME_INTERVAL_MS = Math.round(1000 / FPS);
const PALETTE_REPEAT_MS = 2000;
const ENABLE_FRAME_PREVIEW = true;
const FRAME_HEADER_BYTES = 12;
const PACKED_FRAME_BYTES = WIDTH * HEIGHT / 2;
const MAX_BODY_BYTES = 16 * 1024;

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(rootDirectory, "public");
const udpSocket = dgram.createSocket("udp4");
const eventClients = new Set();

let effectId = "plasma";
let effect = createEffect(effectId);
let deviceIp = "";
let udpPort = DEFAULT_UDP_PORT;
let playing = false;
let paused = false;
let brightness = 0.8;
let speed = 1;
let paletteId = 1;
let sequence = 0;
let sentFrames = 0;
let sendErrors = 0;
let lastPaletteSentAt = 0;
let latestPackedFrame = new Uint8Array(PACKED_FRAME_BYTES);

function scaledPalette() {
  return effect.palette.map((color) => color.map((channel) =>
    Math.round(channel * brightness),
  ));
}

function statePayload() {
  return {
    deviceIp,
    udpPort,
    effect: effectId,
    effects: EFFECTS,
    playing,
    paused,
    brightness,
    speed,
    fps: FPS,
    sentFrames,
    sendErrors,
    paletteId,
    palette: scaledPalette(),
  };
}

function sendEvent(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of eventClients) response.write(message);
}

function broadcastState() {
  sendEvent("state", statePayload());
}

function encodePalettePacket() {
  const palette = scaledPalette();
  const packet = Buffer.alloc(8 + palette.length * 3);
  packet.write("PMUP", 0, "ascii");
  packet[4] = 1;
  packet[5] = palette.length;
  packet.writeUInt16BE(paletteId, 6);
  let offset = 8;
  for (const color of palette) {
    packet[offset] = color[0];
    packet[offset + 1] = color[1];
    packet[offset + 2] = color[2];
    offset += 3;
  }
  return packet;
}

function encodeFramePacket(indices) {
  const packet = Buffer.alloc(FRAME_HEADER_BYTES + PACKED_FRAME_BYTES);
  packet.write("PMUF", 0, "ascii");
  packet[4] = 1;
  packet[5] = WIDTH;
  packet[6] = HEIGHT;
  packet[7] = 0;
  packet.writeUInt16BE(paletteId, 8);
  packet.writeUInt16BE(sequence, 10);
  sequence = (sequence + 1) & 0xFFFF;
  for (let pixel = 0; pixel < indices.length; pixel += 2) {
    packet[FRAME_HEADER_BYTES + pixel / 2] =
      (indices[pixel] << 4) | indices[pixel + 1];
  }
  return packet;
}

function sendUdp(packet) {
  if (!deviceIp) return;
  udpSocket.send(packet, udpPort, deviceIp, (error) => {
    if (error) {
      sendErrors += 1;
    }
  });
}

function sendPalette(now = Date.now()) {
  sendUdp(encodePalettePacket());
  lastPaletteSentAt = now;
}

function nearestPaletteIndex(red, green, blue, palette) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const color = palette[index];
    const dr = red - color[0];
    const dg = green - color[1];
    const db = blue - color[2];
    const distance = dr * dr * 0.24 + dg * dg * 0.69 + db * db * 0.07;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function quantizeFrame(rgbFrame) {
  const indices = new Uint8Array(WIDTH * HEIGHT);
  const palette = effect.palette;
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const offset = pixel * 3;
    indices[pixel] = nearestPaletteIndex(
      rgbFrame[offset],
      rgbFrame[offset + 1],
      rgbFrame[offset + 2],
      palette,
    );
  }
  return indices;
}

function packIndices(indices) {
  const packed = new Uint8Array(PACKED_FRAME_BYTES);
  for (let pixel = 0; pixel < indices.length; pixel += 2) {
    packed[pixel / 2] = (indices[pixel] << 4) | indices[pixel + 1];
  }
  return packed;
}

function sendBlackFrame() {
  if (!deviceIp) return;
  sendPalette();
  sendUdp(encodeFramePacket(new Uint8Array(WIDTH * HEIGHT)));
}

function advancePalette() {
  paletteId = paletteId >= 0xFFFF ? 1 : paletteId + 1;
  sequence = 0;
  lastPaletteSentAt = 0;
}

function applyControl(next) {
  const requestedDeviceIp = Object.hasOwn(next, "deviceIp")
    ? String(next.deviceIp || "").trim()
    : deviceIp;
  const requestedPlaying = Object.hasOwn(next, "playing")
    ? Boolean(next.playing)
    : playing;
  if (requestedPlaying && !requestedDeviceIp) {
    throw new Error("请先填写 PixelMug 的局域网 IP");
  }
  if (Object.hasOwn(next, "deviceIp")) {
    const value = String(next.deviceIp || "").trim();
    if (value && net.isIP(value) !== 4) throw new Error("设备地址必须是 IPv4 地址");
    deviceIp = value;
    lastPaletteSentAt = 0;
  }
  if (Object.hasOwn(next, "udpPort")) {
    const value = Number(next.udpPort);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error("UDP 端口必须是 1 到 65535 的整数");
    }
    udpPort = value;
    lastPaletteSentAt = 0;
  }
  if (Object.hasOwn(next, "effect") && next.effect !== effectId) {
    if (!EFFECTS.some((item) => item.id === next.effect)) throw new Error("未知效果");
    effectId = next.effect;
    effect = createEffect(effectId);
    advancePalette();
  }
  if (Object.hasOwn(next, "brightness")) {
    const value = Number(next.brightness);
    if (!Number.isFinite(value) || value < 0.1 || value > 1) {
      throw new Error("亮度必须在 0.1 到 1 之间");
    }
    if (value !== brightness) {
      brightness = value;
      advancePalette();
    }
  }
  if (Object.hasOwn(next, "speed")) {
    const value = Number(next.speed);
    if (!Number.isFinite(value) || value < 0.5 || value > 2) {
      throw new Error("速度必须在 0.5 到 2 之间");
    }
    speed = value;
  }
  if (Object.hasOwn(next, "playing")) {
    const wasPlaying = playing;
    playing = Boolean(next.playing);
    if (wasPlaying && !playing) sendBlackFrame();
  }
  if (Object.hasOwn(next, "paused")) {
    paused = Boolean(next.paused);
  }
  if (!playing) paused = false;
  if (playing && !deviceIp) throw new Error("请先填写 PixelMug 的局域网 IP");
  if (playing) sendPalette();
  broadcastState();
  return statePayload();
}

function renderAndSend() {
  if (!playing || paused || !deviceIp) return;
  const now = Date.now();
  if (now - lastPaletteSentAt >= PALETTE_REPEAT_MS) sendPalette(now);
  const indices = quantizeFrame(effect.render(speed));
  latestPackedFrame = packIndices(indices);
  sendUdp(encodeFramePacket(indices));
  sentFrames += 1;
  if (ENABLE_FRAME_PREVIEW) {
    sendEvent("frame", {
      paletteId,
      pixels: Buffer.from(latestPackedFrame).toString("base64"),
    });
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function sendFile(response, fileName) {
  const filePath = path.join(publicDirectory, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求内容过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("请求不是有效的 JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

const httpServer = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && requestUrl.pathname === "/api/state") {
    sendJson(response, 200, statePayload());
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/control") {
    try {
      sendJson(response, 200, applyControl(await readJson(request)));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    response.write("retry: 1000\n\n");
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
    return;
  }
  if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html")) {
    sendFile(response, "index.html");
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/main.js") {
    sendFile(response, "main.js");
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/styles.css") {
    sendFile(response, "styles.css");
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

function localIPv4Addresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push({ name, address: entry.address });
    }
  }
  return addresses;
}

const frameTimer = setInterval(renderAndSend, FRAME_INTERVAL_MS);
const stateTimer = setInterval(() => {
  if (eventClients.size > 0) broadcastState();
}, 1000);
const keepAliveTimer = setInterval(() => {
  for (const response of eventClients) response.write(": keep-alive\n\n");
}, 15000);

udpSocket.on("error", (error) => console.error("UDP error:", error));
httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`Effect caster: http://localhost:${HTTP_PORT}`);
  console.log(`PixelMug UDP port: ${DEFAULT_UDP_PORT}`);
  console.log("LAN addresses:");
  for (const { name, address } of localIPv4Addresses()) {
    console.log(`  ${name}: http://${address}:${HTTP_PORT}`);
  }
});

function shutdown() {
  clearInterval(frameTimer);
  clearInterval(stateTimer);
  clearInterval(keepAliveTimer);
  if (playing) sendBlackFrame();
  for (const response of eventClients) response.end();
  eventClients.clear();
  setTimeout(() => {
    udpSocket.close();
    httpServer.close();
  }, 50);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);







