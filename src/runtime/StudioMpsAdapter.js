import { studioDeviceRef, studioLaunchMps } from './StudioLaunch.js';

export async function studioInstallMps(app, device, timeoutMillis = 20000) {
  const route = studioDeviceRef(device);
  const prepared = await app.request('system.studio.prepareMps', { device: route }, { timeoutMillis });
  const contextId = prepared?.contextId || prepared?.result?.contextId;
  if (!contextId) throw new Error('Bot did not provide a Studio execution context');
  return studioLaunchMps({ ...route, contextId }, {
    onEvent: event => {
      app.emit?.('system.deviceEvent', { payload: {
        device,
        events: event.value ? [{ method: 'mpyVmEvent', params: { value: event.value } }] : [],
        launchId: event.launchId,
        state: event.state,
        message: event.message,
      } });
      app.emit?.('studio.launch', { payload: { ...event, device } });
    },
  }, timeoutMillis);
}
