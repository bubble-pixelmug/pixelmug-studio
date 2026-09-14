export function deviceIconFor(device = {}) {
  let src;
  try {
    const url = new URL(device.avatar);
    if (['https:', 'http:'].includes(url.protocol)) src = url.href;
  } catch {}
  return { src, model: device.name || device.talId || 'Device', kind: 'remote' };
}
