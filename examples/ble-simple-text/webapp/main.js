import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
const [device] = await webapp.getDevices();
const ble = new BleAppClient(webapp.ble, { appId: 'BleSimpleText' });

const connectButton = document.querySelector('#connect');
const connectionStatus = document.querySelector('#connection-status');
const keyboard = document.querySelector('#keyboard');

for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = letter;
  button.onclick = async () => {
    await ble.sendSimpleText(letter);
  };
  keyboard.append(button);
}

connectButton.disabled = !device;
connectButton.onclick = async () => {
  connectButton.disabled = true;
  connectionStatus.textContent = '正在连接…';
  connectionStatus.className = '';
  try {
    await ble.connect(device);
    connectionStatus.textContent = '蓝牙已连接';
    connectionStatus.className = 'connected';
    keyboard.disabled = false;
  } catch {
    connectionStatus.textContent = '蓝牙未连接';
    connectButton.disabled = false;
  }
};

window.addEventListener('pagehide', () => {
  ble.close();
  webapp.stop();
});
