import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
let device;
let ble;
const installButton = document.querySelector('#install-mpy');
const connectButton = document.querySelector('#connect');
const connectionStatus = document.querySelector('#connection-status');
const coordinate = document.querySelector('#coordinate');
const canvas = document.querySelector('#grid');
const context = canvas.getContext('2d');
let lastCell = null;

const launchParams = new URLSearchParams(globalThis.location.search);
const mpsId = launchParams.get('mps_id') || import.meta.env.VITE_MPS_ID || '';
const mpsVersion = launchParams.get('mps_version') || import.meta.env.VITE_MPS_VERSION || '';

function drawGrid(x = -1, y = -1) {
  const cellWidth = canvas.width / 32;
  const cellHeight = canvas.height / 16;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (x >= 0 && y >= 0) {
    context.fillStyle = '#4f7cff';
    context.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
  }

  context.strokeStyle = '#cbd2df';
  context.lineWidth = 1;
  context.beginPath();
  for (let column = 0; column <= 32; column += 1) {
    const lineX = column * cellWidth;
    context.moveTo(lineX, 0);
    context.lineTo(lineX, canvas.height);
  }
  for (let row = 0; row <= 16; row += 1) {
    const lineY = row * cellHeight;
    context.moveTo(0, lineY);
    context.lineTo(canvas.width, lineY);
  }
  context.stroke();
}

async function sendCoordinate(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.min(31, Math.max(0, Math.floor((event.clientX - bounds.left) * 32 / bounds.width)));
  const y = Math.min(15, Math.max(0, Math.floor((event.clientY - bounds.top) * 16 / bounds.height)));
  const cell = `${x},${y}`;

  if (cell === lastCell) return;
  lastCell = cell;
  coordinate.textContent = `(${x},${y})`;
  drawGrid(x, y);
  if (!ble?.ready) return;
  try {
    await ble.sendSimpleRaw(new Uint8Array([x, y]));
  } catch (error) {
    connectionStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

installButton.onclick = async () => {
  installButton.disabled = true;
  connectionStatus.textContent = 'Installing MPY on the device…';
  try {
    if (!mpsId || !mpsVersion) throw new Error('MPS ID and version are not configured.');
    await refreshDevice();
    if (!device) throw new Error('Bind a PixelMug before installing MPY.');
    const response = await webapp.callDevice(device, {
      method: 'talMpyExecOneScript',
      params: { id: mpsId, version: mpsVersion },
    });
    const code = mpyExecReturnCode(response);
    if (![260, 261, 262, 263, 264, 265].includes(code)) {
      throw new Error('The device did not accept the MPY install request.');
    }
    connectionStatus.textContent = code === 264
      ? 'MPY is already running on the device.'
      : 'MPY installation started. Wait for it to finish, then connect Bluetooth.';
    connectButton.disabled = false;
  } catch (error) {
    connectionStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    installButton.disabled = false;
  }
};

connectButton.onclick = async () => {
  connectButton.disabled = true;
  connectionStatus.textContent = 'Connecting Bluetooth…';
  connectionStatus.className = '';
  try {
    await refreshDevice();
    if (!device) throw new Error('Bind a PixelMug before connecting.');
    ble?.close();
    ble = new BleAppClient(webapp.ble, { appId: 'BleSimpleControl' });
    await ble.connect(device);
    connectionStatus.textContent = 'Bluetooth connected.';
    connectionStatus.className = 'connected';
  } catch (error) {
    connectionStatus.textContent = error instanceof Error ? error.message : 'Bluetooth is not connected.';
    connectButton.disabled = false;
  }
};

async function refreshDevice() {
  [device] = await webapp.getDevices();
  return device;
}

function mpyExecReturnCode(response) {
  const result = response?.result;
  const value = result && typeof result === 'object'
    ? result.value ?? result.result?.value ?? result.result
    : result ?? response?.value;
  const code = Number(value);
  return Number.isFinite(code) ? code : Number(response?.code);
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  lastCell = null;
  sendCoordinate(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (event.buttons !== 0) sendCoordinate(event);
});

canvas.addEventListener('pointerup', (event) => {
  canvas.releasePointerCapture(event.pointerId);
  lastCell = null;
});

drawGrid();

window.addEventListener('pagehide', () => {
  ble?.close();
  webapp.stop();
});
