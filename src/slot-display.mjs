// The registered Bot slots define the card count. Once a chat has been
// observed, every card reflects that chat, including its empty slots.
export function displayBotSlots(slots = [], bindings = [], accountDevices = [], chat = null) {
  if (!chat?.id) return slots.map(slot => ({ ...slot, device:null, chatBound: true }));
  const bySlot = new Map();
  for (const binding of bindings) {
    if (String(binding.chat?.id) !== String(chat.id) || !Number.isInteger(binding.device?.slot)) continue;
    bySlot.set(binding.device.slot, binding);
  }
  const owned = new Map(accountDevices.map(device => [String(device.id), device]));
  return slots.map((slot, index) => {
    const bound = bySlot.get(index + 1)?.device;
    const accountDevice = bound && owned.get(String(bound.deviceId));
    return { ...slot, chatBound: true, chatId: String(chat.id),
      device: bound ? { id: String(bound.deviceId),
        name: bound.name || accountDevice?.name || String(bound.deviceId),
        sn: bound.sn || accountDevice?.sn || '', avatar: bound.avatar || accountDevice?.avatar || '',talId:bound.talId || slot.talId || '',
        online: bound.online === false ? 'OFFLINE' : 'ONLINE' } : null };
  });
}

// The sidebar is a shortcut to the visible cards, in the same slot order.
export function bindingsForDisplayedSlots(slots = [], bindings = []) {
  return slots.map((slot, index) => {
    if (!slot.device?.id) return null;
    return bindings.find(binding =>
      String(binding.chat?.id) === String(slot.chatId) &&
      binding.device?.slot === index + 1 &&
      String(binding.device?.deviceId) === String(slot.device.id)) || null;
  });
}
