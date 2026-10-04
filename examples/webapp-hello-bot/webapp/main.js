import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';

const webapp = new BubbleWebApp({ ble: false });
const form = document.querySelector('#hello-form');
const nameInput = document.querySelector('#name');
const result = document.querySelector('#result');
const submitButton = form.querySelector('button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  result.classList.remove('error');
  result.textContent = '正在请求 Bot…';

  try {
    const response = await webapp.request('app.hello', {
      name: nameInput.value,
    });

    result.textContent = response.result.message;
  } catch (error) {
    result.classList.add('error');
    result.textContent = `请求失败：${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
});
