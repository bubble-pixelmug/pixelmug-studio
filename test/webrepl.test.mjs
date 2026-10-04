import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { WebRepl } from "../src/webrepl.mjs";

// Protocol fixture only, not a product device simulator.
test("WebREPL authenticates, parses fragmented raw responses, uploads binary/empty files and streams execution", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" }); await once(server, "listening");
  const files = new Map(); let password, holdProbe = false, pendingProbe, probeCount = 0;
  server.on("connection", ws => {
    let header = Buffer.alloc(0), upload;
    ws.send("Pass"); ws.send("word: ");
    ws.on("message", (bytes, binary) => {
      if (binary) {
        if (upload) {
          upload.data = Buffer.concat([upload.data, bytes]);
          if (upload.data.length === upload.size) { files.set(upload.name, upload.data); upload = null; ws.send(Buffer.from("WB\0\0")); }
          return;
        }
        header = Buffer.concat([header, bytes]);
        if (header.length === 82) {
          if (header[2] === 3) {
            header = Buffer.alloc(0); probeCount++;
            ws.send("still running\n");
            const reply = () => ws.send(Buffer.from([1,24,0]));
            if (holdProbe) pendingProbe = reply; else reply();
            return;
          }
          upload = { name: header.subarray(18).toString().replace(/\0.*$/s,""), size: header.readUInt32LE(12), data: Buffer.alloc(0) };
          header = Buffer.alloc(0);
          ws.send(Buffer.from("WB\0\0"));
          if (!upload.size) { files.set(upload.name, upload.data); upload = null; ws.send(Buffer.from("WB\0\0")); }
        }
        return;
      }
      const text = bytes.toString();
      if (text === "pixelmug\r") { password = text; ws.send("\r\nWebREPL con"); ws.send("nected\r\n>>> "); }
      else if (text.includes("\x01")) ws.send("raw REPL; CTRL-B to exit\r\n>");
      else if (text === "\x02") ws.send("\r\n>>> ");
      else if (text.endsWith("\x04")) {
        const match = /print\("([^"]+)"\)/.exec(text);
        ws.send("O"); ws.send("K");
        if (text.startsWith("RUN")) ws.send("hello device\n");
        else { ws.send((match?.[1] || "result") + "\r\n\x04"); ws.send("\x04>"); }
      }
    });
  });
  const repl = new WebRepl({ timeout: 2000 });
  try {
    await repl.connect("127.0.0.1", server.address().port);
    assert.equal(password, "pixelmug\r");
    assert.match(await repl.exec('print("hello")'), /hello/);
    await repl.putFile("data.bin", Buffer.from([0,1,2,255]));
    await repl.putFile("empty.txt", Buffer.alloc(0));
    assert.deepEqual(files.get("data.bin"), Buffer.from([0,1,2,255]));
    assert.equal(files.get("empty.txt").length, 0);
    await assert.rejects(repl.putFile("x".repeat(64), Buffer.from("x")), /63/);
    const output = once(repl, "output");
    await repl.start("RUN");
    assert.match((await output)[0], /hello device/);
    const restartedOutput = once(repl, "output");
    await repl.restart("RUN AGAIN");
    assert.match((await restartedOutput)[0], /hello device/);
    const probeOutput = [];
    repl.on("output", text => probeOutput.push(text));
    assert.equal(await repl.probe(500), true);
    assert.equal(probeOutput.join(""), "still running\n");
    holdProbe = true;
    assert.equal(await repl.probe(80), false);
    assert.equal(repl.closed, false);
    assert.equal(await repl.probe(80), false);
    assert.equal(probeCount, 2, "no second request while a late response is outstanding");
    assert.equal(probeOutput.join(""), "still running\nstill running\n");
    pendingProbe();
    const deadline = Date.now() + 1000;
    while (repl.healthCheck && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
    assert.equal(repl.healthCheck, null);
    holdProbe = false;
    assert.equal(await repl.probe(500), true);
    assert.equal(probeCount, 3);
    assert.equal(probeOutput.join(""), "still running\nstill running\nstill running\n");
  } finally { repl.close(); for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
});

test("wrong WebREPL password produces an explicit authentication error", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" }); await once(server, "listening");
  server.on("connection", ws => { ws.send("Password: "); ws.on("message", () => ws.send("Access denied")); });
  const repl = new WebRepl({ timeout: 1000 });
  try { await assert.rejects(repl.connect("127.0.0.1", server.address().port), error => error.code === "WEBREPL_AUTH"); }
  finally { repl.close(); for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
});



test("silent socket times out without closing or sending terminal control characters", async () => {
  const server = new WebSocketServer({port:0, host:"127.0.0.1"}); await once(server,"listening");
  const frames = [];
  const repl = new WebRepl();
  const connected = once(server,"connection");
  repl.ws = new (await import("ws")).default("ws://127.0.0.1:"+server.address().port);
  await once(repl.ws,"open"); const [peer] = await connected;
  peer.on("message", (bytes, binary) => frames.push({bytes,binary}));
  repl.streaming = true;
  try {
    assert.equal(await repl.probe(80), false);
    assert.equal(repl.closed, false);
    assert.ok(frames.every(f=>f.binary));
    const request = Buffer.concat(frames.map(f=>f.bytes));
    assert.equal(request.length,82); assert.equal(request[2],3);
  } finally { repl.close(); for(const client of server.clients)client.terminate(); await new Promise(r=>server.close(r)); }
});


test("WebREPL identifies a reset during HTTP upgrade before authentication", async () => {
  const server = createServer();
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const repl = new WebRepl({timeout:1000});
  try {
    await assert.rejects(repl.connect("127.0.0.1", server.address().port), error => {
      assert.match(error.message, /127\.0\.0\.1:\d+ \[WebSocket handshake\]: socket hang up/);
      assert.equal(error.code, "ECONNRESET");
      return true;
    });
  } finally { repl.close(); await new Promise(resolve => server.close(resolve)); }
});
