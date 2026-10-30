import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
let device;
let ble;
const installButton = document.querySelector('#install-mpy');
const controls = document.querySelector('fieldset');
const launchParams = new URLSearchParams(globalThis.location.search);
const mpsId = launchParams.get('mps_id') || import.meta.env.VITE_MPS_ID || '';
const mpsVersion = launchParams.get('mps_version') || import.meta.env.VITE_MPS_VERSION || '';

installButton.onclick = async () => {
  installButton.disabled = true;
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
    controls.disabled = false;
  } catch (error) {
    console.error(error);
  } finally {
    installButton.disabled = false;
  }
};

document.querySelector('#connect').onclick = async () => {
  await refreshDevice();
  if (!device) return;
  ble?.close();
  ble = new BleAppClient(webapp.ble, { appId: 'BleMinimal' });
  await ble.connect(device);
};

document.querySelector('#disconnect').onclick = async () => {
  if (!ble?.ready) return;
  await ble.command('disconnect', {}, { retries: 0 });
};

document.querySelector('#reconnect').onclick = async () => {
  if (!ble) return;
  await ble.reconnect();
};

document.querySelector('#echo').onclick = async () => {
  if (!ble?.ready) return;
  await ble.command('echo', { text: 'echo' });
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

window.addEventListener('pagehide', () => {
  ble?.close();
  webapp.stop();
});
