import test from "node:test";
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { parseQuestions, createAddressResponse, startMdnsResponder } from "../src/mdns.mjs";

function query(name, unicast = false) {
  const labels = name.split(".").flatMap(label => {
    const bytes = Buffer.from(label);
    return [Buffer.from([bytes.length]), bytes];
  });
  const header = Buffer.alloc(12); header.writeUInt16BE(1, 4);
  const tail = Buffer.alloc(5); tail.writeUInt16BE(1, 1); tail.writeUInt16BE(unicast ? 0x8001 : 1, 3);
  return Buffer.concat([header, ...labels, tail]);
}

test("mDNS parser recognizes pixelmug-studio.local A questions", () => {
  assert.deepEqual(parseQuestions(query("pixelmug-studio.local", true)), [{
    name: "pixelmug-studio.local", type: 1, class: 1, unicast: true,
  }]);
  const response = createAddressResponse("pixelmug-studio.local", ["192.168.1.20", "10.0.0.8"]);
  assert.equal(response.readUInt16BE(2), 0x8400);
  assert.equal(response.readUInt16BE(6), 2);
  assert.ok(response.includes(Buffer.from([192,168,1,20])));
  assert.ok(response.includes(Buffer.from([10,0,0,8])));
});

test("mDNS responder answers a unicast hostname query", async t => {
  const responder = await startMdnsResponder({ port: 0, addresses: () => ["192.168.50.7"] });
  const client = createSocket("udp4");
  t.after(async () => { client.close(); await responder.close(); });
  await new Promise(resolve => client.bind(0, "127.0.0.1", resolve));
  client.send(query("pixelmug-studio.local", true), responder.port, "127.0.0.1");
  const timeout = setTimeout(() => client.close(), 1000);
  const [packet] = await once(client, "message"); clearTimeout(timeout);
  assert.equal(packet.readUInt16BE(6), 1);
  assert.ok(packet.includes(Buffer.from([192,168,50,7])));
});