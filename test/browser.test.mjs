import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import WebSocket from "ws";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
import { startStudio } from "../src/receiver.mjs";

test("real browser loads demo, captures button logs/global errors and removes token from page URL", {
  skip: !process.env.STUDIO_TEST_BROWSER, timeout: 30000,
}, async () => {
  const project = await mkdtemp(join(tmpdir(), "pixelmug-studio-browser-"));
  let studio, browser, socket;
  try {
    const webRoot = join(project, "webapp");
    await mkdir(webRoot);
    await cp(fileURLToPath(new URL("../examples/studio-debug/webapp/", import.meta.url)), webRoot, { recursive: true });
    await writeFile(join(webRoot, "browser-check.html"), `<!doctype html><html><body>
      <iframe id="app"></iframe>
      <script>
      const frame = document.querySelector("#app");
      frame.src = "/app/index.html" + location.hash;
      frame.onload = () => {
        const timer = setInterval(() => {
          const doc = frame.contentDocument;
          if (!doc.querySelector("#log")?.onclick) return;
          clearInterval(timer);
          for (const id of ["log", "warn", "throw", "reject"]) doc.getElementById(id).click();
          document.body.dataset.tokenRemoved = String(!frame.contentWindow.location.hash.includes("studioToken"));
        }, 100);
      };
      </script></body></html>`);
    studio = await startStudio({ project, webRoot: "webapp", port: 0, bind: "127.0.0.1" });
    const profile = join(project, "browser-profile");
    browser = spawn(process.env.STUDIO_TEST_BROWSER, [
      "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--disable-component-update", "--disable-sync",
      "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
    ], { windowsHide: true, stdio: "ignore" });
    let port;
    for (let i=0; i<100; i++) {
      try { port = Number((await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]); break; }
      catch { await sleep(100); }
    }
    assert.ok(port, "Chrome started");
    const pages = await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
    socket = new WebSocket(pages.find(page=>page.type==="page").webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
    let serial=0; const pending=new Map();
    socket.on("message",raw=>{const msg=JSON.parse(raw);if(msg.id){const call=pending.get(msg.id);pending.delete(msg.id);msg.error?call.reject(new Error(msg.error.message)):call.resolve(msg.result);}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{
      const response=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
      if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    await send("Page.navigate",{url:studio.baseUrl+"/app/browser-check.html#studioToken="+studio.token});
    let dom;
    for(let i=0;i<100;i++) {
      dom=await evaluate("document.documentElement.outerHTML");
      if(dom.includes('data-token-removed="true"'))break;
      await sleep(100);
    }
    assert.match(dom, /data-token-removed="true"/);
    let text;
    for (let i=0;i<100;i++) {
      text = await readFile(join(studio.debugDir, "events.jsonl"), "utf8");
      if(text.includes('"kind":"unhandledRejection"') && text.includes('"kind":"uncaughtException"'))break;
      await sleep(100);
    }
    const records = text.trim().split("\n").map(JSON.parse);
    assert.ok(records.some(r => r.message.includes("WebApp 入口已执行")));
    assert.ok(records.some(r => r.message.includes("按钮点击")));
    assert.ok(records.some(r => r.level === "warn"));
    assert.ok(records.some(r => r.kind === "uncaughtException"));
    assert.ok(records.some(r => r.kind === "unhandledRejection"));
    assert.ok(!text.includes("example-secret-token"));
  } finally {
    socket?.close();
    if (browser) { browser.kill(); await sleep(500); }
    await studio?.close();
    await rm(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
