import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
const [device] = await webapp.getDevices();
const ble = new BleAppClient(webapp.ble, { appId: 'BleSimpleControl' });

const connectButton = document.querySelector('#connect');
const connectionStatus = document.querySelector('#connection-status');
const coordinate = document.querySelector('#coordinate');
const canvas = document.querySelector('#grid');
const context = canvas.getContext('2d');
let lastCell = null;

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
  if (!ble.ready) return;
  await ble.sendSimpleRaw(new Uint8Array([x, y]));
}

connectButton.disabled = !device;
connectButton.onclick = async () => {
  connectButton.disabled = true;
  connectionStatus.textContent = '正在连接…';
  connectionStatus.className = '';
  try {
    await ble.connect(device);
    connectionStatus.textContent = '蓝牙已连接';
    connectionStatus.className = 'connected';
  } catch {
    connectionStatus.textContent = '蓝牙未连接';
    connectButton.disabled = false;
  }
};

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
  ble.close();
  webapp.stop();
});
