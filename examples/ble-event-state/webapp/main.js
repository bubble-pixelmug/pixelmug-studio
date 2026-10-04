import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
const [device] = await webapp.getDevices();
const client = new BleAppClient(webapp.ble, { appId: 'BleEventState' });

function showCount(state) {
  document.querySelector('#count').textContent = state.count;
}

// 状态：设备每秒发布当前计数，网页自动更新数字。
client.on('state', showCount);

// 事件：只在整十或重新计数时发生，保留最近一次通知。
client.on('event', (event) => {
  if (event.event === 'multipleOfTen') {
    document.querySelector('#event').textContent = `计数到达 ${event.count}`;
  } else if (event.event === 'counterReset') {
    document.querySelector('#event').textContent = '计数归零，开始新一轮';
  }
});

document.querySelector('#connect').onclick = async () => {
  await client.connect(device);
  showCount(await client.requestSnapshot());
};

// 快照：主动读取 MPY 此刻提供的 { count: ... }。
document.querySelector('#snapshot').onclick = async () => {
  showCount(await client.requestSnapshot());
};

document.querySelector('fieldset').disabled = !device;

window.addEventListener('pagehide', () => {
  client.close();
  webapp.stop();
});
