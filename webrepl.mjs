import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One connection, one operation at a time. PUT responses and REPL output share this socket.
export class WebRepl extends EventEmitter {
  constructor({ timeout = 15000 } = {}) {
    super(); this.timeout = timeout; this.buffer = Buffer.alloc(0); this.streaming = false;
    this.pending = null; this.closed = false; this.decoder = new TextDecoder();
  }
  async connect(host, port = 8266) {
    let stage = "WebSocket handshake";
    try {
      this.ws = new WebSocket("ws://" + host + ":" + port + "/", { perMessageDeflate: false, handshakeTimeout: this.timeout });
      this.ws.on("open", () => { stage = "password prompt"; });
      this.ws.on("unexpected-response", (request, response) => {
        this.fail(new Error("WebREPL HTTP upgrade rejected: " + response.statusCode));
        request.destroy();
        this.ws.terminate();
      });
      this.ws.on("message", (data, binary) => {
        if (this.streaming && binary && this.healthCheck) {
          this.healthCheck.bytes = Buffer.concat([this.healthCheck.bytes, data]);
          if (this.healthCheck.bytes.length >= 3) this.healthCheck.finish(this.healthCheck.bytes.length === 3);
          return;
        }
        if (this.streaming) { this.emit("output", this.decoder.decode(data, { stream: true })); return; }
        this.buffer = Buffer.concat([this.buffer, data]);
        if (this.buffer.length > 1024 * 1024) { this.fail(new Error("WebREPL response too large")); return; }
        this.pump();
      });
      this.ws.on("error", error => this.fail(error));
      this.ws.on("close", () => {
        this.closed = true; this.fail(new Error("WebREPL disconnected"));
        if (this.streaming) this.emit("output", this.decoder.decode());
        this.emit("disconnect");
      });
      // Password may arrive immediately after the HTTP upgrade; buffering starts above.
      await this.until("Password: ");
      stage = "password authentication";
      this.send("pixelmug\r");
      const login = await this.untilAny(["WebREPL connected", "Access denied"]);
      if (login.includes("Access denied")) { this.close(); const error = new Error("设备 WebREPL 密码与预设不一致"); error.code = "WEBREPL_AUTH"; throw error; }
      stage = "REPL prompt";
      await this.until(">>> ");
      stage = "raw REPL probe";
      const probe = randomBytes(8).toString("hex");
      const output = await this.exec("print(" + JSON.stringify(probe) + ")");
      if (!output.includes(probe)) throw new Error("WebREPL probe failed");
      return this;
    } catch (cause) {
      const error = new Error(`WebREPL ${host}:${port} [${stage}]: ${cause.message}`, { cause });
      error.code = cause.code;
      this.close();
      throw error;
    }
  }
  send(data) {
    if (this.closed || this.ws?.readyState !== WebSocket.OPEN) throw new Error("WebREPL not connected");
    this.ws.send(data);
  }
  fail(error) {
    this.lastError = error;
    this.healthCheck?.finish(false);
    if (this.pending) { const p = this.pending; this.pending = null; clearTimeout(p.timer); p.reject(error); }
  }
  pump() {
    const p = this.pending;
    if (!p) return;
    const count = p.match(this.buffer);
    if (count === undefined) return;
    this.pending = null; clearTimeout(p.timer);
    const result = this.buffer.subarray(0, count);
    this.buffer = this.buffer.subarray(count);
    p.resolve(result);
  }
  take(match, timeout = this.timeout) {
    if (this.pending) return Promise.reject(new Error("Concurrent WebREPL operation"));
    if (this.lastError) return Promise.reject(this.lastError);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending = null; reject(new Error("WebREPL operation timed out")); }, timeout);
      this.pending = { match, resolve, reject, timer };
      this.pump();
    });
  }
  async until(text) { return this.untilAny([text]); }
  async untilAny(texts) {
    return (await this.take(buffer => {
      for (const text of texts) { const i = buffer.indexOf(text); if (i >= 0) return i + Buffer.byteLength(text); }
    })).toString("utf8");
  }
  async raw() {
    this.send("\r\x03\x03\x01");
    await this.until("raw REPL; CTRL-B to exit\r\n>");
  }
  async exec(code) {
    if (this.streaming) throw new Error("Application is running; restart before executing commands");
    await this.raw();
    this.send(code + "\x04");
    const ack = await this.take(b => b.length >= 2 ? 2 : undefined);
    if (ack.toString() !== "OK") throw new Error("Raw REPL did not acknowledge command");
    const stdout = await this.until("\x04");
    const stderr = await this.until("\x04");
    await this.until(">");
    this.send("\x02");
    await this.until(">>> ");
    if (stderr.slice(0, -1).trim()) throw new Error(stderr.slice(0, -1).trim());
    return stdout.slice(0, -1);
  }
  async putFile(name, bytes) {
    if (this.streaming) throw new Error("Cannot upload while application is running");
    if (Buffer.byteLength(name) > 63) throw new Error("WebREPL filename exceeds 63 UTF-8 bytes");
    const request = Buffer.alloc(82);
    request.write("WA"); request[2] = 1; request.writeUInt32LE(bytes.length, 12);
    request.writeUInt16LE(Buffer.byteLength(name), 16); request.write(name, 18);
    // The existing PixelMug tool splits the 82-byte header; preserve that handshake.
    this.send(request.subarray(0, 10)); this.send(request.subarray(10));
    await this.fileAck();
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      const drainDeadline = Date.now() + 15000;
      while (this.ws.bufferedAmount > 65536) {
        await sleep(5);
        if (this.closed) throw new Error("Upload disconnected");
        if (Date.now() > drainDeadline) throw new Error("WebREPL upload stalled");
      }
      this.send(bytes.subarray(offset, offset + 1024));
      await sleep(5);
    }
    await this.fileAck();
  }
  async fileAck() {
    const ack = await this.take(b => b.length >= 4 ? 4 : undefined, 60000);
    if (ack[0] !== 87 || ack[1] !== 66 || ack.readUInt16LE(2) !== 0) throw new Error("WebREPL file transfer failed: " + ack.toString("hex"));
  }
  async start(code) {
    await this.raw(); this.send(code + "\x04");
    const ack = await this.take(b => b.length >= 2 ? 2 : undefined);
    if (ack.toString() !== "OK") throw new Error("Raw REPL execution was not accepted");
    this.streaming = true;
    if (this.buffer.length) { this.emit("output", this.decoder.decode(this.buffer, { stream: true })); this.buffer = Buffer.alloc(0); }
  }
  probe(timeout = 3000) {
    if (this.healthCheck) return this.healthCheck.promise;
    if (!this.streaming || this.closed || this.lastError || this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    let complete;
    const promise = new Promise(resolve => { complete = resolve; });
    const check = { promise, bytes: Buffer.alloc(0), finish: ok => {
      if (this.healthCheck !== check) return;
      clearTimeout(check.timer); this.healthCheck = null;
      complete(ok);

    } };
    this.healthCheck = check;
    // GET_VER has no request ID. Keep its response slot after timeout so a late
    // reply is drained, never mistaken for a new probe or application output.
    check.timer = setTimeout(() => complete(false), timeout);
    const request = Buffer.alloc(82); request.write("WA"); request[2] = 3; // WebREPL GET_VER
    try { this.send(request.subarray(0, 10)); this.send(request.subarray(10)); }
    catch { check.finish(false); }
    return promise;
  }
  close() { this.closed = true; this.fail(new Error("WebREPL closed")); this.ws?.terminate(); }
}

