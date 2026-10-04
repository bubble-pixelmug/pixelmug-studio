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

try {
  const devices = await webapp.getDevices();
  device = devices[0];

  if (!device) {
    deviceLabel.textContent = '当前对话还没有关联设备，请返回 Bot 发送 /bind。';
  } else {
    deviceLabel.textContent = `当前设备：${device.name || device.deviceId}`;
    setButtonsDisabled(false);
  }
} catch (error) {
  showError(`获取关联设备失败：${error.message}`);
}

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
  status.textContent = onoff ? '正在打开屏幕…' : '正在关闭屏幕…';

  try {
    const rpc = deviceRpc.talSetDisplayOnOff({ onoff });
    await webapp.callDevice(device, rpc);
    status.textContent = onoff ? '屏幕已打开。' : '屏幕已关闭。';
  } catch (error) {
    showError(`设备调用失败：${error.message}`);
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
