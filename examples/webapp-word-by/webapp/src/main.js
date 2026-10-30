import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import {
  rpc,
  Specifications,
} from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const webapp = new BubbleWebApp({ ble: false });
const form = document.querySelector('#word-form');
const textInput = document.querySelector('#text');
const submitButton = form.querySelector('button');
const status = document.querySelector('#status');
const controls = [
  {
    name: document.querySelector('#device-1'),
    size: document.querySelector('#size-1'),
    color: document.querySelector('#color-1'),
  },
  {
    name: document.querySelector('#device-2'),
    size: document.querySelector('#size-2'),
    color: document.querySelector('#color-2'),
  },
];

let devices = [];

webapp.onDevicesChanged(() => {
  loadDevices().catch(showError);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (devices.length < 2) {
    status.textContent = 'Bind a device to both slots first.';
    return;
  }

  const parts = splitText(textInput.value.trim());
  if (parts.length < 2) {
    status.textContent = 'Enter at least two characters or two space-separated words.';
    return;
  }

  submitButton.disabled = true;
  status.textContent = 'Sending…';

  try {
    const rpcs = await Promise.all(
      controls.map((control, index) => rpc.talPrintText({
        text: parts[index],
        specifications: Specifications[control.size.value],
        color: control.color.value,
        direction: 0,
      })),
    );

    await Promise.all(
      devices.map((device, index) => webapp.callDevice(device, rpcs[index])),
    );

    status.textContent = `Displayed “${parts[0]}” and “${parts[1]}”.`;
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = devices.length < 2;
  }
});

loadDevices().catch(showError);

async function loadDevices() {
  devices = (await webapp.getDevices())
    .sort((left, right) => Number(left.slot) - Number(right.slot))
    .slice(0, 2);

  controls.forEach((control, index) => {
    const device = devices[index];
    control.name.textContent = device
      ? device.name || `Device ${index + 1}`
      : `Device ${index + 1} is unbound`;
  });

  submitButton.disabled = devices.length < 2;
  status.textContent = devices.length < 2
    ? 'Bind a device to both slots first.'
    : 'Both devices are ready.';
}

function splitText(text) {
  if (!text) return [];

  const words = text.split(/\s+/);
  return words.length > 1
    ? words.slice(0, 2)
    : Array.from(text).slice(0, 2);
}

function showError(error) {
  status.textContent = `Operation failed: ${error.message}`;
}
