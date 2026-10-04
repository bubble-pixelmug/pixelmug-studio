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
    status.textContent = '请先为两个 slot 关联设备。';
    return;
  }

  const parts = splitText(textInput.value.trim());
  if (parts.length < 2) {
    status.textContent = '请输入至少两个字，或两个用空格分隔的单词。';
    return;
  }

  submitButton.disabled = true;
  status.textContent = '正在发送…';

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

    status.textContent = `已显示“${parts[0]}”和“${parts[1]}”。`;
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = devices.length < 2;
  }
});

try {
  await loadDevices();
} catch (error) {
  showError(error);
}

async function loadDevices() {
  devices = (await webapp.getDevices())
    .sort((left, right) => Number(left.slot) - Number(right.slot))
    .slice(0, 2);

  controls.forEach((control, index) => {
    const device = devices[index];
    control.name.textContent = device
      ? device.name || `设备 ${index + 1}`
      : `设备 ${index + 1} 未关联`;
  });

  submitButton.disabled = devices.length < 2;
  status.textContent = devices.length < 2
    ? '请先为两个 slot 关联设备。'
    : '两个设备已就绪。';
}

function splitText(text) {
  if (!text) return [];

  const words = text.split(/\s+/);
  return words.length > 1
    ? words.slice(0, 2)
    : Array.from(text).slice(0, 2);
}

function showError(error) {
  status.textContent = `操作失败：${error.message}`;
}
