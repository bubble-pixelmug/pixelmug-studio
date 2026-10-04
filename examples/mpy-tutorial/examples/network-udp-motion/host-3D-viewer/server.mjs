// PixelMug UDP Motion 配套上位机。
// 首次运行：npm install
// 启动服务：npm start
// 然后把设备端 __main__.py 的 HOST_IP 改为与 PixelMug 同一局域网的地址。
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UDP_PORT = Number.parseInt(process.env.UDP_PORT || "9000", 10);
const HTTP_PORT = Number.parseInt(process.env.HTTP_PORT || "8080", 10);
const HOST = "0.0.0.0";
const MAX_PACKET_BYTES = 512;

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(rootDirectory, "public");
const threeBuildDirectory = path.join(rootDirectory, "node_modules", "three", "build");
const threeModulePath = path.join(threeBuildDirectory, "three.module.js");
const threeCorePath = path.join(threeBuildDirectory, "three.core.js");

const eventClients = new Set();
let lastSender = null;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMotionPacket(buffer) {
  if (buffer.length > MAX_PACKET_BYTES) {
    throw new Error("packet is larger than 512 bytes");
  }

  const packet = JSON.parse(buffer.toString("utf8"));
  if (
    packet === null ||
    packet.v !== 2 ||
    !Number.isInteger(packet.seq) ||
    packet.seq < 0 ||
    !Number.isInteger(packet.t) ||
    packet.t < 0 ||
    !Array.isArray(packet.q) ||
    packet.q.length !== 4 ||
    !packet.q.every(isFiniteNumber)
  ) {
    throw new Error("invalid quaternion motion packet");
  }

  const normSquared = packet.q.reduce((sum, value) => sum + value * value, 0);
  if (normSquared < 0.25 || normSquared > 2.25) {
    throw new Error("quaternion norm is outside the accepted range");
  }

  return {
    v: 2,
    seq: packet.seq,
    t: packet.t,
    q: packet.q,
    receivedAt: Date.now(),
  };
}

function broadcastMotion(packet) {
  const payload = `data: ${JSON.stringify(packet)}\n\n`;
  for (const response of eventClients) {
    response.write(payload);
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function sendFile(response, filePath) {
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

const httpServer = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    response.write("retry: 1000\n\n");
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
    return;
  }

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    sendFile(response, path.join(publicDirectory, "index.html"));
    return;
  }
  if (requestUrl.pathname === "/main.js") {
    sendFile(response, path.join(publicDirectory, "main.js"));
    return;
  }
  if (requestUrl.pathname === "/three.module.js") {
    sendFile(response, threeModulePath);
    return;
  }
  if (requestUrl.pathname === "/three.core.js") {
    sendFile(response, threeCorePath);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

const udpServer = dgram.createSocket("udp4");
udpServer.on("message", (message, remote) => {
  try {
    const packet = parseMotionPacket(message);
    const sender = `${remote.address}:${remote.port}`;
    if (sender !== lastSender) {
      lastSender = sender;
      console.log(`Receiving PixelMug quaternion motion from ${sender}`);
    }
    broadcastMotion(packet);
  } catch (error) {
    console.warn(`Ignored UDP packet from ${remote.address}: ${error.message}`);
  }
});

udpServer.on("error", (error) => {
  console.error("UDP server error:", error);
});

function localIPv4Addresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push({ name, address: entry.address });
      }
    }
  }
  return addresses;
}

const keepAlive = setInterval(() => {
  for (const response of eventClients) response.write(": keep-alive\n\n");
}, 15000);

udpServer.bind(UDP_PORT, HOST, () => {
  console.log(`UDP listening on ${HOST}:${UDP_PORT}`);
});

httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`Viewer: http://localhost:${HTTP_PORT}`);
  console.log("Set HOST_IP to the address on the same LAN as PixelMug:");
  for (const { name, address } of localIPv4Addresses()) {
    console.log(`  ${name}: ${address}  (http://${address}:${HTTP_PORT})`);
  }
});

function shutdown() {
  clearInterval(keepAlive);
  for (const response of eventClients) response.end();
  eventClients.clear();
  udpServer.close();
  httpServer.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);