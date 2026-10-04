import test from "node:test";
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { parseQuestions, createAddressResponse, startMdnsResponder, createQueryResponse, sameIPv4Subnet } from "../src/mdns.mjs";

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
test("legacy mDNS reply echoes query ID/questions and omits cache-flush", () => {
  const packet = query("pixelmug-studio.local");
  packet.writeUInt16BE(0x2345, 0);
  const response = createQueryResponse(packet, "pixelmug-studio.local", ["172.16.30.5"], 51000);
  assert.equal(response.unicast, true);
  assert.equal(response.packet.readUInt16BE(0), 0x2345);
  assert.deepEqual(parseQuestions(response.packet), parseQuestions(packet));
  const nameLength = packet.length - 12 - 4;
  const record = packet.length + nameLength;
  assert.equal(response.packet.readUInt16BE(record + 2), 1);
  assert.equal(response.packet.readUInt32BE(record + 4), 10);
});

test("normal multicast and QU replies retain mDNS ID and cache behavior", () => {
  for (const unicast of [false, true]) {
    const packet = query("pixelmug-studio.local", unicast);
    packet.writeUInt16BE(0x2345, 0);
    const response = createQueryResponse(packet, "pixelmug-studio.local", ["172.16.30.5"], 5353);
    assert.equal(response.unicast, unicast);
    assert.equal(response.packet.readUInt16BE(0), 0);
    assert.equal(response.packet.readUInt16BE(4), 0);
    const record = 12 + packet.length - 12 - 4;
    assert.equal(response.packet.readUInt16BE(record + 2), 0x8001);
    assert.equal(response.packet.readUInt32BE(record + 4), 120);
  }
});

test("responses and unrelated questions never trigger a reply loop", () => {
  const packet = query("pixelmug-studio.local");
  packet.writeUInt16BE(0x8400, 2);
  assert.equal(createQueryResponse(packet, "pixelmug-studio.local", ["172.16.30.5"], 5353), null);
  assert.equal(createQueryResponse(query("other.local"), "pixelmug-studio.local", ["172.16.30.5"], 5353), null);
});

test("interface selection respects the subnet instead of answering with VPN or virtual-host addresses", () => {
  assert.equal(sameIPv4Subnet("172.16.30.5", "172.16.31.20", "255.255.254.0"), true);
  assert.equal(sameIPv4Subnet("172.16.30.5", "172.16.32.20", "255.255.254.0"), false);
  assert.equal(sameIPv4Subnet("198.18.0.1", "172.16.30.20", "255.255.255.252"), false);
  assert.equal(sameIPv4Subnet("192.168.56.1", "172.16.30.20", "255.255.255.0"), false);
});