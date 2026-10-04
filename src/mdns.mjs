import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";

const GROUP = "224.0.0.251";
const PORT = 5353;
const TYPE_A = 1;
const TYPE_ANY = 255;
const CLASS_IN = 1;

function encodeName(name) {
  const labels = name.replace(/\.$/, "").split(".");
  const parts = [];
  for (const label of labels) {
    const bytes = Buffer.from(label, "utf8");
    if (!bytes.length || bytes.length > 63) throw new Error("Invalid mDNS hostname");
    parts.push(Buffer.from([bytes.length]), bytes);
  }
  return Buffer.concat([...parts, Buffer.from([0])]);
}
function readName(packet, start, visited = new Set()) {
  let offset = start, next = start, jumped = false;
  const labels = [];
  for (let count = 0; count < 128; count++) {
    if (offset >= packet.length) throw new Error("Truncated DNS name");
    const length = packet[offset];
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) throw new Error("Truncated DNS pointer");
      const pointer = ((length & 0x3f) << 8) | packet[offset + 1];
      if (visited.has(pointer)) throw new Error("DNS pointer loop");
      visited.add(pointer);
      if (!jumped) next = offset + 2;
      offset = pointer; jumped = true; continue;
    }
    if (length & 0xc0) throw new Error("Unsupported DNS label");
    offset++;
    if (!length) { if (!jumped) next = offset; return { name: labels.join(".").toLowerCase(), next }; }
    if (offset + length > packet.length) throw new Error("Truncated DNS label");
    labels.push(packet.subarray(offset, offset + length).toString("utf8"));
    offset += length;
    if (!jumped) next = offset;
  }
  throw new Error("DNS name too deep");
}
export function parseQuestions(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 12) throw new Error("Invalid DNS packet");
  const count = packet.readUInt16BE(4), questions = [];
  let offset = 12;
  for (let index = 0; index < count; index++) {
    const decoded = readName(packet, offset); offset = decoded.next;
    if (offset + 4 > packet.length) throw new Error("Truncated DNS question");
    const type = packet.readUInt16BE(offset), rawClass = packet.readUInt16BE(offset + 2); offset += 4;
    questions.push({ name: decoded.name, type, class: rawClass & 0x7fff, unicast: Boolean(rawClass & 0x8000) });
  }
  return questions;
}
function ipv4Bytes(address) {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error("Invalid IPv4 address");
  return Buffer.from(parts);
}
export function createAddressResponse(hostname, addresses, ttl = 120, { id = 0, questions = [], cacheFlush = true } = {}) {
  const name = encodeName(hostname), records = addresses.map(address => {
    const data = ipv4Bytes(address), fixed = Buffer.alloc(10);
    fixed.writeUInt16BE(TYPE_A, 0); fixed.writeUInt16BE((cacheFlush ? 0x8000 : 0) | CLASS_IN, 2);
    fixed.writeUInt32BE(ttl, 4); fixed.writeUInt16BE(data.length, 8);
    return Buffer.concat([name, fixed, data]);
  });
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(questions.length, 4); header.writeUInt16BE(records.length, 6);
  const questionRecords = questions.map(question => {
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(question.type, 0);
    tail.writeUInt16BE(question.class | (question.unicast ? 0x8000 : 0), 2);
    return Buffer.concat([encodeName(question.name), tail]);
  });
  return Buffer.concat([header, ...questionRecords, ...records]);
}
export function localIPv4Addresses() {
  return [...new Set(Object.values(networkInterfaces()).flat()
    .filter(item => item && item.family === "IPv4" && !item.internal && item.address)
    .map(item => item.address))];
}
export function sameIPv4Subnet(address, peer, netmask) {
  const a = ipv4Bytes(address), b = ipv4Bytes(peer), mask = ipv4Bytes(netmask);
  return a.every((byte, index) => (byte & mask[index]) === (b[index] & mask[index]));
}
export function createQueryResponse(packet, hostname, addresses, sourcePort) {
  // Ignore responses, unsupported opcodes and error packets.
  if (packet.length < 12 || (packet.readUInt16BE(2) & 0xf80f)) return null;
  const questions = parseQuestions(packet);
  const relevant = questions.filter(question => question.name === hostname && question.class === CLASS_IN && (question.type === TYPE_A || question.type === TYPE_ANY));
  if (!relevant.length || !addresses.length) return null;
  const legacy = sourcePort !== PORT;
  return {
    packet: createAddressResponse(hostname, addresses, legacy ? 10 : 120,
      legacy ? { id: packet.readUInt16BE(0), questions, cacheFlush: false } : {}),
    unicast: legacy || relevant.some(question => question.unicast),
  };
}
export async function startMdnsResponder({ hostname = "pixelmug-studio.local", port = PORT, addresses = localIPv4Addresses } = {}) {
  const normalized = hostname.replace(/\.$/, "").toLowerCase();
  const interfaceAddresses = port === PORT ? addresses() : [null];
  const candidates = interfaceAddresses.length ? interfaceAddresses : [null];
  const sockets = [];
  let closed = false;

  async function open(interfaceAddress) {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    socket.on("message", (packet, remote) => {
      try {
        const available = addresses();
        const current = interfaceAddress && available.includes(interfaceAddress) ? [interfaceAddress] : interfaceAddress ? [] : available;
        // Windows may deliver a multicast query to several reused sockets.
        // Only the interface on the caller's subnet may advertise its address.
        const iface = Object.values(networkInterfaces()).flat().find(item => item.address === interfaceAddress);
        if (iface && !sameIPv4Subnet(interfaceAddress, remote.address, iface.netmask)) return;
        const response = createQueryResponse(packet, normalized, current, remote.port);
        if (!response) return;
        socket.send(response.packet, response.unicast ? remote.port : PORT, response.unicast ? remote.address : GROUP, () => {});
      } catch {}
    });
    await new Promise((resolve, reject) => {
      const failed = error => { try { socket.close(); } catch {} reject(error); };
      socket.once("error", failed);
      socket.bind(port, "0.0.0.0", () => { socket.off("error", failed); resolve(); });
    });
    if (port === PORT) {
      try {
        socket.addMembership(GROUP, interfaceAddress || undefined);
        if (interfaceAddress) socket.setMulticastInterface(interfaceAddress);
        socket.setMulticastTTL(255); socket.setMulticastLoopback(true);
      } catch (error) { socket.close(); throw error; }
    }
    socket.on("error", error => { if (!closed) console.warn("[Studio mDNS]", interfaceAddress || "default", error.message); });
    return socket;
  }

  for (const interfaceAddress of candidates) {
    try { sockets.push({ socket: await open(interfaceAddress), interfaceAddress }); }
    catch (error) { console.warn("[Studio mDNS] 无法加入网卡", interfaceAddress || "default", error.message); }
  }
  if (!sockets.length) throw new Error(`无法启动 ${normalized} mDNS：没有可用的组播网卡`);
  const announce = ttl => {
    if (closed) return;
    const available = addresses();
    for (const entry of sockets) {
      const current = entry.interfaceAddress && available.includes(entry.interfaceAddress) ? [entry.interfaceAddress] : entry.interfaceAddress ? [] : available;
      if (current.length) entry.socket.send(createAddressResponse(normalized, current, ttl), PORT, GROUP, () => {});
    }
  };
  let refreshTask;
  async function refreshInterfaces() {
    const desired = addresses();
    if (desired.length === sockets.length && desired.every(address => sockets.some(entry => entry.interfaceAddress === address))) return;
    for (const entry of [...sockets]) {
      if (desired.includes(entry.interfaceAddress)) continue;
      sockets.splice(sockets.indexOf(entry), 1);
      await new Promise(resolve => entry.socket.close(resolve));
    }
    for (const interfaceAddress of desired) {
      if (closed || sockets.some(entry => entry.interfaceAddress === interfaceAddress)) continue;
      try { sockets.push({ socket: await open(interfaceAddress), interfaceAddress }); }
      catch (error) { if (!closed) console.warn('[Studio mDNS]', interfaceAddress, error.message); }
    }
    announce(120);
  }
  const refreshTimer = port === PORT ? setInterval(() => {
    if (!closed && !refreshTask) refreshTask = refreshInterfaces().finally(() => { refreshTask = null; });
  }, 5000) : null;
  refreshTimer?.unref?.();
  announce(120);
  const secondAnnouncement = setTimeout(() => announce(120), 1000);
  secondAnnouncement.unref?.();
  async function close() {
    if (closed) return;
    clearTimeout(secondAnnouncement); clearInterval(refreshTimer); announce(0); closed = true;
    await refreshTask;
    await Promise.all(sockets.map(({ socket }) => new Promise(resolve => socket.close(resolve))));
  }
  return { socket: sockets[0].socket, sockets: sockets.map(item => item.socket), hostname: normalized,
    port: sockets[0].socket.address().port, addresses, close };
}