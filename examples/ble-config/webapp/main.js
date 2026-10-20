import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const connect = document.querySelector('#connect');
const install = document.querySelector('#install-mpy');
const form = document.querySelector('form');
const fields = document.querySelector('fieldset');
const send = document.querySelector('#send');
const status = document.querySelector('#status');
let webapp;
let client;

const launchParams = new URLSearchParams(globalThis.location.search);
const mpsId = launchParams.get('mps_id') || import.meta.env.VITE_MPS_ID || '';
const mpsVersion = launchParams.get('mps_version') || import.meta.env.VITE_MPS_VERSION || '';

install.onclick = async () => {
  install.disabled = true;
  status.textContent = 'Installing MPY on the device...';
  try {
    if (!mpsId || !mpsVersion) throw new Error('MPS ID and version are not configured.');
    webapp ||= new BubbleWebApp();
    const [device] = await webapp.getDevices();
    if (!device) throw new Error('Bind a PixelMug S1 before installing MPY.');
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
  connect.disabled = true;
  status.textContent = 'Connecting to PixelMug...';
  try {
    webapp ||= new BubbleWebApp();
    const [device] = await webapp.getDevices();
    if (!device) throw new Error('Bind a PixelMug S1 before connecting.');
    client?.close();
    client = new BleAppClient(webapp.ble, { appId: 'BleConfig' });
    client.on('event', (event) => {
      if (event.name !== 'settings') return;
      if (event.event === 'configApplied') {
        status.textContent = 'The cup received the configuration and is displaying it.';
        send.disabled = false;
      } else if (event.event === 'configError') {
        status.textContent = `The device rejected the configuration: ${event.error}`;
        send.disabled = false;
      }
    });
    client.on('connectionState', (event) => {
      if (event.connection === 'disconnected' || event.connection === 'failed') {
        fields.disabled = true;
        connect.disabled = false;
        status.textContent = event.message || 'Bluetooth disconnected.';
      }
    });
    await client.connect(device);
    fields.disabled = false;
    send.disabled = false;
    status.textContent = 'Connected. You can send the default configuration.';
  } catch (error) {
    connect.disabled = false;
    status.textContent = error instanceof Error ? error.message : String(error);
  }
};

form.onsubmit = async (event) => {
  event.preventDefault();
  send.disabled = true;
  try {
    const data = new FormData(form);
    const settings = {
      config1: Number(data.get('config1')),
      config2: data.get('config2'),
      config3: data.get('config3') === 'true',
      config4: JSON.parse(data.get('config4')),
      config5: JSON.parse(data.get('config5')),
    };
    if (!Number.isFinite(settings.config1)) throw new Error('config1 must be a finite number.');
    if (!Array.isArray(settings.config4)) throw new Error('config4 must be an array.');
    if (settings.config5 === null || Array.isArray(settings.config5) || typeof settings.config5 !== 'object') {
      throw new Error('config5 must be an object.');
    }
    status.textContent = 'Uploading configuration and waiting for the device...';
    await client.setConfig('settings', settings);
    status.textContent = 'Configuration uploaded. The device is applying it.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    send.disabled = false;
  }
};

connect.disabled = false;
window.addEventListener('pagehide', () => {
  client?.close();
  webapp?.stop();
});
