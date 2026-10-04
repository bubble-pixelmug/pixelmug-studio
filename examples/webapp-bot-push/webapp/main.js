import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';

const webapp = new BubbleWebApp({ ble: false });
const startButton = document.querySelector('#start');
const status = document.querySelector('#status');

webapp.on('app.progress', (event) => {
  status.textContent = `Bot 推送：${event.payload.progress}%`;
});

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  status.textContent = '正在请求 Bot…';

  try {
    const response = await webapp.request('app.startTask');
    status.textContent = response.result.message;
  } catch (error) {
    status.textContent = `请求失败：${error.message}`;
  } finally {
    startButton.disabled = false;
  }
});
