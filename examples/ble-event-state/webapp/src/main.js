import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
let device;
let client;
const installButton = document.querySelector('#install-mpy');
const controls = document.querySelector('fieldset');
const launchParams = new URLSearchParams(globalThis.location.search);
const mpsId = launchParams.get('mps_id') || import.meta.env.VITE_MPS_ID || '';
const mpsVersion = launchParams.get('mps_version') || import.meta.env.VITE_MPS_VERSION || '';

function showCount(state) {
  document.querySelector('#count').textContent = state.count;
}

function handleEvent(event) {
  if (event.event === 'multipleOfTen') {
    document.querySelector('#event').textContent = `Count reached ${event.count}`;
  } else if (event.event === 'counterReset') {
    document.querySelector('#event').textContent = 'Counter reset; starting a new cycle.';
  }
}

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
  client?.close();
  client = new BleAppClient(webapp.ble, { appId: 'BleEventState' });
  client.on('state', showCount);
  client.on('event', handleEvent);
  await client.connect(device);
  showCount(await client.requestSnapshot());
};

document.querySelector('#snapshot').onclick = async () => {
  if (!client?.ready) return;
  showCount(await client.requestSnapshot());
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
  client?.close();
  webapp.stop();
});
