import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
const [device] = await webapp.getDevices();
const ble = new BleAppClient(webapp.ble, { appId: 'BleSimpleMotion' });

const connectButton = document.querySelector('#connect');
const connectionStatus = document.querySelector('#connection-status');
const outputs = {
  ax: document.querySelector('#ax'),
  ay: document.querySelector('#ay'),
  az: document.querySelector('#az'),
  gx: document.querySelector('#gx'),
  gy: document.querySelector('#gy'),
  gz: document.querySelector('#gz'),
};

ble.on('simpleData', (data) => {
  if (data.dataType !== 0 || data.bytes.byteLength !== 24) return;

  const view = new DataView(
    data.bytes.buffer,
    data.bytes.byteOffset,
    data.bytes.byteLength,
  );

  outputs.ax.value = view.getFloat32(0, true).toFixed(3);
  outputs.ay.value = view.getFloat32(4, true).toFixed(3);
  outputs.az.value = view.getFloat32(8, true).toFixed(3);
  outputs.gx.value = view.getFloat32(12, true).toFixed(1);
  outputs.gy.value = view.getFloat32(16, true).toFixed(1);
  outputs.gz.value = view.getFloat32(20, true).toFixed(1);
});

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

window.addEventListener('pagehide', () => {
  ble.close();
  webapp.stop();
});
