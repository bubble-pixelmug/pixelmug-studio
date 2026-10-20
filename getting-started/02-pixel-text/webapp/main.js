import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { rpc } from '@jeejio-bubble/bot/devices/pixelmug/ext';

const text = document.querySelector('#text');
const fontSize = document.querySelector('#font-size');
const color = document.querySelector('#color');
const scroll = document.querySelector('#scroll');
const direction = document.querySelector('#direction');
const speed = document.querySelector('#speed');
const speedValue = document.querySelector('#speed-value');
const send = document.querySelector('#send');
const status = document.querySelector('#status');
let webapp;
let device;

speed.oninput = () => {
  speedValue.textContent = speed.value;
};
scroll.onchange = () => {
  direction.disabled = !scroll.checked;
  speed.disabled = !scroll.checked;
};

send.onclick = async () => {
  const value = text.value.trim();
  if (!value) {
    status.textContent = 'Enter text to display first.';
    return;
  }

  send.disabled = true;
  status.textContent = 'Sending text...';
  try {
    const options = {
      text: value,
      specifications: fontSize.value,
      color: color.value,
      direction: scroll.checked ? Number(direction.value) : 0,
      speed: Number(speed.value),
    };

    const command = await rpc.talPrintText(options);

    await webapp.callDevice(device, command);
    console.log('WebApp log: Device call completed');
    status.textContent = `Text displayed on ${device.name || 'PixelMug'}`;
  } catch (error) {
    console.error('WebApp log: Send Failed:', error);
    status.textContent = error.message;
  } finally {
    send.disabled = false;
  }
};

async function loadDevices() {
  const devices = await webapp.getDevices();
  console.log('WebApp log: get devices:', devices);
  device = devices.find((item) =>
    item.talId === 'PixelMug' ||
    item.talId === 'PixelMugS1' ||
    /pixelmug/i.test(item.name || '')
  );

  if (device) {
    status.textContent = `Ready: ${device.name || 'PixelMug'}`;
    send.disabled = false;
    return;
  }
  status.textContent = 'No PixelMug is connected. Bind a device and reopen this WebApp.';
}

async function initialize() {
  try {
    console.log('WebApp log: Start Initialization');
    webapp = new BubbleWebApp();
    await loadDevices();
  } catch (error) {
    console.error('[init] Initialization failed:', error);
    status.textContent = error.message;
  }
}

initialize();
