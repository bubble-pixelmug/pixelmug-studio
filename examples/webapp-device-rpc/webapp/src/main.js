import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { rpc as deviceRpc } from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const webapp = new BubbleWebApp({ ble: false });
const deviceLabel = document.querySelector('#device');
const status = document.querySelector('#status');
const buttons = [
  document.querySelector('#turn-on'),
  document.querySelector('#turn-off'),
];

let device;

initialize().catch((error) => {
  showError(`Failed to load bound device: ${error.message}`);
});

document.querySelector('#turn-on').addEventListener('click', () => {
  setDisplay(true);
});

document.querySelector('#turn-off').addEventListener('click', () => {
  setDisplay(false);
});

async function setDisplay(onoff) {
  if (!device) return;

  setButtonsDisabled(true);
  status.classList.remove('error');
  status.textContent = onoff ? 'Turning the display on…' : 'Turning the display off…';

  try {
    const rpc = deviceRpc.talSetDisplayOnOff({ onoff });
    await webapp.callDevice(device, rpc);
    status.textContent = onoff ? 'Display turned on.' : 'Display turned off.';
  } catch (error) {
    showError(`Device call failed: ${error.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  for (const button of buttons) button.disabled = disabled;
}

function showError(message) {
  status.classList.add('error');
  status.textContent = message;
}

async function initialize() {
  const devices = await webapp.getDevices();
  device = devices[0];

  if (!device) {
    deviceLabel.textContent = 'No device is bound. Send /bind to the Bot first.';
    return;
  }

  deviceLabel.textContent = `Current device: ${device.name || device.deviceId}`;
  setButtonsDisabled(false);
}
