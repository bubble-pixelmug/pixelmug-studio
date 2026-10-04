import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const connect = document.querySelector('#connect');
const pad = document.querySelector('#pad');
const dot = document.querySelector('#dot');
let webapp, client, start, nextPacket;
let sending = false;
function showConnection(state) {
  connect.textContent = state === 'connected' ? '已连接蓝牙，可以开始体验'
    : state === 'connecting' ? '连接中' : '蓝牙连接 PixelMug';
  connect.className = state === 'connected' ? 'primary connected' : 'primary';
  connect.disabled = state !== 'disconnected';
}

showConnection('disconnected');

connect.onclick = async () => {
  client?.close();
  showConnection('connecting');
  try {
    webapp ||= new BubbleWebApp();
    const [device] = await webapp.getDevices();
    if (!device) throw new Error('请先在 Studio 关联一个 PixelMug S1。');
    client = new BleAppClient(webapp.ble, { appId: 'GettingStartedLight' });
    client.on('connectionState', (event) => {
      if (event.connection === 'disconnected' || event.connection === 'failed') {
        nextPacket = null;
        start = null;
        showConnection('disconnected');
      }
    });
    showConnection('connecting');
    await client.connect(device);
    showConnection('connected');
  } catch (error) {
    console.error(error);
    nextPacket = null;
    start = null;
    showConnection('disconnected');
  }
};

function point(event, kind) {
  const rect = pad.getBoundingClientRect();
  const x = Math.max(0, Math.min(31, Math.floor((event.clientX - rect.left) / rect.width * 32)));
  const y = Math.max(0, Math.min(15, Math.floor((event.clientY - rect.top) / rect.height * 16)));
  dot.style.left = `${(x + 0.5) / 32 * 100}%`;
  dot.style.top = `${(y + 0.5) / 16 * 100}%`;
  // 与 MPY 约定三个字节：[1 移动 / 2 轻点, x, y]。
  nextPacket = new Uint8Array([kind, x, y]);
}
pad.onpointerdown = (event) => {
  if (!client?.ready) return;
  pad.setPointerCapture(event.pointerId);
  start = { x: event.clientX, y: event.clientY, at: Date.now() };
  point(event, 1);
};
pad.onpointermove = (event) => { if (start) point(event, 1); };
pad.onpointerup = (event) => {
  if (!start) return;
  const tap = Date.now() - start.at < 350 && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12;
  point(event, tap ? 2 : 1);
  start = null;
};
pad.onpointercancel = () => { start = null; };

// 每 50 毫秒发送最新位置，避免手指滑动产生大量积压消息。
const timer = setInterval(async () => {
  if (!client?.ready || !nextPacket || sending) return;
  const packet = nextPacket;
  nextPacket = null;
  sending = true;
  try { await client.sendSimpleRaw(packet); }
  catch (error) { console.error(error); }
  finally { sending = false; }
}, 50);
window.addEventListener('pagehide', () => { clearInterval(timer); client?.close(); webapp?.stop(); });
