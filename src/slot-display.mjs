// CreatorHub slot details describe the signed-in user's bindings. A group Bot
// can have bindings owned by other players, which come from the live Bot SDK.
export function displayBotSlots(slots = [], bindings = [], accountDevices = []) {
  const groups = new Map();
  for (const binding of bindings) {
    if (binding.chat?.type !== 'group' || !binding.chat.id || !Number.isInteger(binding.device?.slot)) continue;
    const group = groups.get(binding.chat.id) || { id: binding.chat.id, latest: '', bindings: new Map() };
    group.latest = group.latest > (binding.updatedAt || '') ? group.latest : (binding.updatedAt || '');
    group.bindings.set(binding.device.slot, binding);
    groups.set(group.id, group);
  }
  const group = [...groups.values()].sort((a, b) => b.bindings.size - a.bindings.size || b.latest.localeCompare(a.latest))[0];
  const owned = new Map(accountDevices.map(device => [String(device.id), device]));
  return slots.map((slot, index) => {
    const bound = group?.bindings.get(index + 1)?.device;
    if (!bound) return { ...slot, groupBound: false };
    const accountDevice = owned.get(String(bound.deviceId));
    return { ...slot, groupBound: true, groupId: group.id,
      device: { id: String(bound.deviceId), name: bound.name || accountDevice?.name || String(bound.deviceId),
        sn: accountDevice?.sn || '', avatar: accountDevice?.avatar || '',
        online: bound.online === true ? 'ONLINE' : 'OFFLINE' } };
  });
}
