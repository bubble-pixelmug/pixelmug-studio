import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { BubbleBot } from "../../../mps/jeejio-bubble/sdk/BubbleBot.js";
import { BubbleWebApp } from "../../../mps/jeejio-bubble/sdk/WebApp.js";
import { installStudioLaunch } from "../runtime/StudioLaunch.js";

const sdk = new URL("../../../mps/jeejio-bubble/sdk/", import.meta.url);
test("generic SDK has no Studio modules, device imports or debug transport dependencies", async () => {
  for (const name of await readdir(sdk)) {
    assert.ok(!/studio/i.test(name), name);
    if (!name.endsWith(".js")) continue;
    const source = await readFile(new URL(name, sdk), "utf8");
    assert.doesNotMatch(source, /studio|pixelmug|talMpy|[\"']\.\.\/devices\//i, name);
  }
});

test("loading a Studio protocol client alone cannot change the generic SDK", async t => {
  const dispose = installStudioLaunch({enabled:true,runId:"boundary"}, async () => { assert.fail("SDK called Studio"); });
  t.after(dispose);
  const rpc = {method:"talMpyExecOneScript",params:{id:"published",version:"1"}};
  const device = {deviceId:"cup",slotId:"slot",slot:1};
  let sends = 0;
  const bot = new BubbleBot("test", {api:{sendDeviceRpc(request) {
    sends++; assert.deepEqual(request.rpc,rpc);
    setTimeout(() => bot.processDeviceUpdate({type:"rpc",code:200,result:{value:264},extend:{traceId:request.traceId}}),0);
    return {code:201};
  }}});
  assert.equal((await bot.callDevice({id:"chat"},device,rpc)).tal.result,264);
  assert.equal(sends,1);
  const web = new BubbleWebApp({autoStart:false,ble:false,bridge:{sendTAL(message,reply) {
    assert.deepEqual(message.content.value,rpc); reply({code:200,result:{value:264}});
  }}});
  assert.equal((await web.callDevice(device,rpc)).result.value,264);
});
