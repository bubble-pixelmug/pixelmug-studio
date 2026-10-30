import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import { parseNotify } from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';

const webapp = new BubbleWebApp({ ble: false });
const deviceLabel = document.querySelector('#device');
const subscriptionLabel = document.querySelector('#subscription');
const chargingLabel = document.querySelector('#charging');
const subscribeButton = document.querySelector('#subscribe');
const unsubscribeButton = document.querySelector('#unsubscribe');

let device;
let subscribed = false;

webapp.onDeviceEvent((event) => {
  if (event.payload?.device?.deviceId !== device?.deviceId) return;

  const events = parseNotify(event.payload?.events || []);
  const chargingEvent = events.find((item) => item.name === 'CurChargingState');
  if (!chargingEvent) return;

  const value = chargingEvent.params?.value;
  const charging = value === true || value === 1 || value === '1';
  chargingLabel.textContent = charging ? 'Charging' : 'Not charging';
});

webapp.onDevicesChanged(() => {
  refreshDevice().catch(showError);
});

subscribeButton.addEventListener('click', async () => {
  try {
    await webapp.subscribeDeviceEvents(device);
    subscribed = true;
    render();
  } catch (error) {
    showError(error);
  }
});

unsubscribeButton.addEventListener('click', async () => {
  try {
    await webapp.unsubscribeDeviceEvents(device);
    subscribed = false;
    render();
  } catch (error) {
    showError(error);
  }
});

refreshDevice().catch(showError);

async function refreshDevice() {
  await updateDevice(await webapp.getDevices());
}

async function updateDevice(devices) {
  const nextDevice = devices[0];
  const shouldResubscribe = subscribed;

  if (subscribed && device) {
    await webapp.unsubscribeDeviceEvents(device);
  }

  device = nextDevice;
  subscribed = false;
  chargingLabel.textContent = 'Waiting for charging events';

  if (shouldResubscribe && device) {
    await webapp.subscribeDeviceEvents(device);
    subscribed = true;
  }

  render();
}

function render() {
  deviceLabel.textContent = device
    ? `Current device: ${device.name || device.deviceId}`
    : 'No PixelMug S1 is bound to this chat';

  subscriptionLabel.textContent = subscribed ? 'Subscribed to device events' : 'Not subscribed';
  subscribeButton.disabled = !device || subscribed;
  unsubscribeButton.disabled = !device || !subscribed;
}

function showError(error) {
  subscriptionLabel.textContent = `Operation failed: ${error.message}`;
}
