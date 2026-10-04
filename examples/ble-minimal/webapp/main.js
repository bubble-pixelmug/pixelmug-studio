import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

// 在冒泡 App 中打开，使用第一台已关联的 PixelMug。
const webapp = new BubbleWebApp();
const [device] = await webapp.getDevices();
const ble = new BleAppClient(webapp.ble, { appId: 'BleMinimal' });

// 连接设备，SDK 自动完成鉴权和应用握手。
document.querySelector('#connect').onclick = async () => {
  await ble.connect(device);
};

// disconnect 是本例 MPY 注册的命令，由设备主动断开蓝牙。
document.querySelector('#disconnect').onclick = async () => {
  if (!ble.ready) return;
  await ble.command('disconnect', {}, { retries: 0 });
};

// 先连接过一次，再调用 reconnect() 重新连接和握手。
document.querySelector('#reconnect').onclick = async () => {
  await ble.reconnect();
};

// 发送 echo 命令，杯子收到后显示 echo。
document.querySelector('#echo').onclick = async () => {
  await ble.command('echo', { text: 'echo' });
};

document.querySelector('fieldset').disabled = !device;

// 关闭页面时清理监听和计时器；close() 不代表断开物理连接。
window.addEventListener('pagehide', () => {
  ble.close();
  webapp.stop();
});