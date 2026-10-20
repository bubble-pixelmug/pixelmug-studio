import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const connect = document.querySelector('#connect');
const install = document.querySelector('#install-mpy');
const pad = document.querySelector('#pad');
const dot = document.querySelector('#dot');
const status = document.querySelector('#status');
let webapp, client, start, nextPacket;
let sending = false;
const launchParams = new URLSearchParams(globalThis.location.search);
const mpsId = launchParams.get('mps_id') || import.meta.env.VITE_MPS_ID || '';
const mpsVersion = launchParams.get('mps_version') || import.meta.env.VITE_MPS_VERSION || '';
function showConnection(state) {
  connect.textContent = state === 'connected' ? 'Bluetooth connected — ready to play'
    : state === 'connecting' ? 'Connecting…' : 'Connect to PixelMug';
  connect.className = state === 'connected' ? 'primary connected' : 'primary';
  connect.disabled = state !== 'disconnected';
}

showConnection('disconnected');

install.onclick = async () => {
  install.disabled = true;
  status.textContent = 'Installing MPY on the device...';
  try {
    if (!mpsId || !mpsVersion) throw new Error('MPS ID and version are not configured.');
    webapp ||= new BubbleWebApp();
    const [device] = await webapp.getDevices();
    if (!device) throw new Error('Bind a PixelMug S1 in Studio first.');
    const response = await webapp.callDevice(device, {
      method: 'talMpyExecOneScript',
      params: { id: mpsId, version: mpsVersion },
    });
    const code = mpyExecReturnCode(response);
    if (![260, 261, 262, 263, 264, 265].includes(code)) {
      throw new Error('The device did not accept the MPY install request.');
    }
    status.textContent = code === 264
      ? 'MPY is already running on the device.'
      : 'MPY installation started. Wait for the device to finish, then connect over Bluetooth.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    install.disabled = false;
  }
};

function mpyExecReturnCode(response) {
  const result = response?.result;
  const value = result && typeof result === 'object'
    ? result.value ?? result.result?.value ?? result.result
    : result ?? response?.value;
  const code = Number(value);
  return Number.isFinite(code) ? code : Number(response?.code);
}

connect.onclick = async () => {
  client?.close();
  showConnection('connecting');
  try {
    webapp ||= new BubbleWebApp();
    const [device] = await webapp.getDevices();
    if (!device) throw new Error('Bind a PixelMug S1 in Studio first.');
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
  // The MPY program expects three bytes: [1 move / 2 tap, x, y].
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

// Send the latest position every 50 ms to avoid a backlog during dragging.
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
