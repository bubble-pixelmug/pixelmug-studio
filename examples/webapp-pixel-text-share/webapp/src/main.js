import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import {
  rpc,
  Specifications,
} from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const form = document.querySelector('#text-form');
const textInput = document.querySelector('#text');
const colorSelect = document.querySelector('#color');
const sizeSelect = document.querySelector('#size');
const directionSelect = document.querySelector('#direction');
const submitButton = form.querySelector('button');
const status = document.querySelector('#status');
const deviceInputs = [...document.querySelectorAll('input[name="device"]')];
const deviceLabels = [
  document.querySelector('#device-1'),
  document.querySelector('#device-2'),
];

status.textContent = 'Connecting to the Bubble app…';

let webapp;
let devices = [];

initialize().catch(showError);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = textInput.value.trim();
  const selectedSlot = Number(
    document.querySelector('input[name="device"]:checked')?.value,
  );
  const device = devices.find((item) => Number(item.slot) === selectedSlot);

  if (!text || !device) {
    status.textContent = 'Enter text and select a bound device.';
    return;
  }

  submitButton.disabled = true;
  status.textContent = 'Sending…';

  try {
    const textRpc = await rpc.talPrintText({
      text,
      color: colorSelect.value,
      specifications: Specifications[sizeSelect.value],
      direction: Number(directionSelect.value),
    });

    await webapp.callDevice(device, textRpc, {
      timeoutMillis: 60_000,
    });
    status.textContent = `Sent to ${device.name || `Mug ${device.slot}`}.`;
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = devices.length === 0;
  }
});

async function initialize() {  
  webapp = new BubbleWebApp({ ble: false });
  webapp.onDevicesChanged(() => {
    loadDevices().catch(showError);
  });
  await loadDevices();
}

async function loadDevices() {
  devices = await webapp.getDevices();

  deviceInputs.forEach((input, index) => {
    const slot = index + 1;
    const device = devices.find((item) => Number(item.slot) === slot);

    input.disabled = !device;
    deviceLabels[index].textContent = device
      ? `Slot ${slot} · ${device.name || device.deviceId}`
      : `Slot ${slot} is unbound`;
  });

  const selected = document.querySelector('input[name="device"]:checked');
  if (!selected || selected.disabled) {
    const firstAvailable = deviceInputs.find((input) => !input.disabled);
    if (firstAvailable) firstAvailable.checked = true;
  }

  submitButton.disabled = devices.length === 0;
  status.textContent = devices.length
    ? 'Select a target device.'
    : 'Bind at least one device first.';
}

function showError(error) {
  status.textContent = `Operation failed: ${error.message}`;
}
