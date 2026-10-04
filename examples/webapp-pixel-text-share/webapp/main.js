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

status.textContent = '正在连接冒泡 App…';

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
    status.textContent = '请输入文字并选择一台已关联的杯子。';
    return;
  }

  submitButton.disabled = true;
  status.textContent = '正在发送…';

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
    status.textContent = `已发送到${device.name || `杯子 ${device.slot}`}。`;
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = devices.length === 0;
  }
});

async function initialize() {
  await waitForJeeWeb();
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
      ? `位置 ${slot} · ${device.name || device.deviceId}`
      : `位置 ${slot} 未关联`;
  });

  const selected = document.querySelector('input[name="device"]:checked');
  if (!selected || selected.disabled) {
    const firstAvailable = deviceInputs.find((input) => !input.disabled);
    if (firstAvailable) firstAvailable.checked = true;
  }

  submitButton.disabled = devices.length === 0;
  status.textContent = devices.length
    ? '请选择目标杯子。'
    : '请先关联至少一台杯子。';
}

function showError(error) {
  status.textContent = `操作失败：${error.message}`;
}

async function waitForJeeWeb(timeoutMillis = 3000) {
  const deadline = Date.now() + timeoutMillis;

  while (!globalThis.JeeWeb && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (!globalThis.JeeWeb) {
    throw new Error('未连接到冒泡 App，请在冒泡 App 内重新打开页面');
  }
}
