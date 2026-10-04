import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { BleAppClient } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

const webapp = new BubbleWebApp();
const [device] = await webapp.getDevices();
const client = new BleAppClient(webapp.ble, { appId: 'BleConfig' });
const form = document.querySelector('form');
const fields = document.querySelector('fieldset');
const send = document.querySelector('#send');
const result = document.querySelector('#result');

// 先监听结果。setConfig() 完成只代表上传提交，不代表设备已应用。
client.on('event', (event) => {
  if (event.name !== 'settings') return;
  if (event.event === 'configApplied') {
    result.textContent = '杯子已接收，正在逐条显示';
    send.disabled = false;
  } else if (event.event === 'configError') {
    result.textContent = '应用失败：' + event.error;
    send.disabled = false;
  }
});

document.querySelector('#connect').disabled = !device;
document.querySelector('#connect').onclick = async () => {
  try {
    await client.connect(device);
    fields.disabled = false;
    send.disabled = false;
    result.textContent = '已连接，可直接发送默认配置';
  } catch (error) {
    result.textContent = '连接失败：' + error.message;
  }
};

form.onsubmit = async (event) => {
  event.preventDefault();
  send.disabled = true;
  try {
    const data = new FormData(form);
    // 表单取值是字符串，需要显式转换成相应的 JSON 数据类型。
    const settings = {
      config1: Number(data.get('config1')),
      config2: data.get('config2'),
      config3: data.get('config3') === 'true',
      config4: JSON.parse(data.get('config4')),
      config5: JSON.parse(data.get('config5')),
    };
    if (!Number.isFinite(settings.config1)) throw new Error('config1 必须是有限数字');
    if (!Array.isArray(settings.config4)) throw new Error('config4 必须是数组');
    if (settings.config5 === null || Array.isArray(settings.config5) ||
        typeof settings.config5 !== 'object') {
      throw new Error('config5 必须是对象');
    }

    result.textContent = '正在上传，等待杯子应用…';
    await client.setConfig('settings', settings);
    // 成功提示由 configApplied 事件更新。
  } catch (error) {
    result.textContent = '发送失败：' + error.message;
    send.disabled = false;
  }
};

window.addEventListener('pagehide', () => {
  client.close();
  webapp.stop();
});
