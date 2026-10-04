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
    status.textContent = '请先输入要显示的文字。';
    return;
  }

  send.disabled = true;
  status.textContent = '正在发送文字…';
  try {
    const command = await rpc.talPrintText({
      text: value,
      specifications: fontSize.value,
      color: color.value,
      direction: scroll.checked ? Number(direction.value) : 0,
      speed: Number(speed.value),
    });
    await webapp.callDevice(device, command);
    status.textContent = '文字已经显示到 PixelMug！';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    send.disabled = false;
  }
};

try {
  webapp = new BubbleWebApp({ ble: false });
  const devices = await webapp.getDevices();
  device = devices.find((item) =>
    item.talId === 'PixelMug' ||
    item.talId === 'PixelMugS1' ||
    /pixelmug/i.test(item.name || '')
  );
  if (!device) {
    throw new Error('请先在 Studio 关联一个 PixelMug，然后重新打开页面。');
  }
  status.textContent = `准备好啦：${device.name || 'PixelMug'}`;
  send.disabled = false;
} catch (error) {
  status.textContent = error.message;
}
