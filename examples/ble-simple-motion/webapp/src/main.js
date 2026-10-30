import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
let device;
let ble;
const installButton = document.querySelector('#install-mpy');
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

const launchParams = new URLSearchParams(globalThis.location.search);
const mpsId = launchParams.get('mps_id') || import.meta.env.VITE_MPS_ID || '';
const mpsVersion = launchParams.get('mps_version') || import.meta.env.VITE_MPS_VERSION || '';

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
    ble = new BleAppClient(webapp.ble, { appId: 'BleSimpleMotion' });
    ble.on('simpleData', handleSimpleData);
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

function handleSimpleData(data) {
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
}

window.addEventListener('pagehide', () => {
  ble?.close();
  webapp.stop();
});
