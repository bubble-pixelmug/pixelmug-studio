<script setup>
import { computed, ref, watch } from 'vue';
import { deviceIconFor } from '../deviceIcon.js';
const props = defineProps({ slots: Object, devices: Array, busy: Boolean });
const emit = defineEmits(['refresh', 'choose', 'bind']);
const picker = ref(null), selectedId = ref('');
const selected = computed(() => props.slots?.list?.find(slot => slot.id === selectedId.value));
const candidates = computed(() => (props.devices || []).filter(device => device.talId && selected.value &&
  [selected.value.talId, ...selected.value.compatible].includes(device.talId)));
function choose(slot) {
  selectedId.value = slot.id;
  picker.value.showModal();
  emit('choose');
}
function bind(device) {
  picker.value.close();
  emit('bind', { slotId: selected.value.id, deviceId: device.id });
}
watch(selected, slot => { if (!slot) picker.value?.close(); });
</script>
<template>
  <section class="card bot-slots" aria-label="Bot 关联设备">
    <div class="section-heading"><div><span class="eyebrow">BOT DEVICES</span><h2>关联设备 <span class="count">{{ slots?.list?.length || 0 }}</span></h2></div><button :disabled="busy || slots?.loading" @click="emit('refresh')">{{ slots?.loading ? '正在刷新…' : '刷新' }}</button></div>
    <p v-if="slots?.error" class="slot-error" role="alert">{{ slots.error }}</p>
    <p v-if="!slots?.list?.length" class="subtle">{{ slots?.loading ? '正在查询 Bot 注册的设备槽位…' : slots?.error ? '暂时无法获取槽位，请重试。' : 'Bot 尚未注册设备槽位，注册完成后将自动显示。' }}</p>
    <div class="slot-grid">
      <article v-for="(slot, index) in slots?.list || []" :key="slot.id" class="slot-card">
        <div class="slot-title"><strong>关联设备 {{ index + 1 }}</strong></div>
        <p class="slot-types">TALID：{{ slot.talId || '—' }}<br>兼容 TALID：{{ slot.compatible.join('、') || '无' }}</p>
        <div v-if="slot.device" class="slot-device">
          <div class="device-image"><img v-if="deviceIconFor(slot.device).src" :src="deviceIconFor(slot.device).src" :alt="slot.device.name"></div>
          <div class="slot-device-info"><strong>{{ slot.device.name }}</strong><p class="device-serial">SN {{ slot.device.sn || '—' }}</p><span class="online-status" :class="{offline: slot.device.online !== 'ONLINE'}">{{ slot.device.online === 'ONLINE' ? '● 在线' : '○ 离线' }}</span></div>
        </div>
        <div class="slot-action"><button :class="{primary: !slot.device}" :disabled="busy" @click="choose(slot)">{{ slot.device ? '更换关联设备' : '选择并关联设备' }}</button></div>
      </article>
    </div>
    <dialog ref="picker" class="slot-picker">
      <div class="section-heading"><h2>选择关联设备</h2><button aria-label="关闭" @click="picker.close()">×</button></div>
      <p class="subtle">仅显示当前账号下与此槽位类型兼容的设备。</p>
      <p v-if="busy" aria-live="polite">正在刷新设备列表…</p>
      <p v-else-if="!candidates.length" class="empty">没有符合类型的设备，请先在冒泡 App 中为当前账号添加兼容设备。</p>
      <div class="picker-devices">
        <button v-for="device in candidates" :key="device.id" class="picker-device" :disabled="busy" @click="bind(device)">
          <div class="device-image"><img v-if="deviceIconFor(device).src" :src="deviceIconFor(device).src" :alt="device.name"></div>
          <span class="picker-device-info"><strong>{{ device.name }}</strong><small>SN {{ device.sn || '—' }}</small><small>TALID：{{ device.talId }}</small><small :class="['online-status',{offline:device.online !== 'ONLINE'}]">{{ device.online === 'ONLINE' ? '● 在线' : '○ 离线' }}</small></span>
          <span class="picker-label">关联此设备</span>
        </button>
      </div>
    </dialog>
  </section>
</template>
<style scoped>
.slot-grid { display:grid; grid-template-columns:repeat(auto-fill,min(100%,340px)); gap:20px; }
.slot-card { border:1px solid #d5e3f6; border-radius:20px; background:#f7faff; padding:22px; min-width:0; display:flex; flex-direction:column; }
.slot-title { display:flex; gap:12px; align-items:center; justify-content:space-between; }
.slot-types { color:#617997; font-size:14px; line-height:1.8; overflow-wrap:anywhere; }
.slot-device { display:flex; align-items:center; gap:18px; margin:20px 0; }
.slot-device-info { min-width:0; overflow-wrap:anywhere; }
.device-image { width:88px; height:88px; flex:0 0 88px; background:white; border-radius:18px; overflow:hidden; }
.device-image img { width:100%; height:100%; object-fit:contain; }
.slot-action { display:flex; justify-content:center; padding:16px 0 0; margin-top:auto; }
.slot-card:not(:has(.slot-device)) .slot-action { min-height:128px; align-items:center; }
.slot-error { color:#c62828; }
.slot-picker { width:min(640px,calc(100vw - 40px)); max-height:85vh; padding:28px; border:1px solid #d5e3f6; border-radius:22px; color:inherit; font:inherit; }
.slot-picker::backdrop { background:#102b4d66; }
.picker-devices { display:grid; gap:12px; }
.picker-device { display:flex; align-items:center; text-align:left; gap:16px; width:100%; padding:16px; font-weight:400; white-space:normal; color:#183b65; }
.picker-device small { display:block; color:#6f85a1; font-weight:400; font-size:13px; margin-top:6px; overflow-wrap:anywhere; }
.picker-device-info { min-width:0; overflow-wrap:anywhere; }
.picker-device-info strong,.slot-device-info strong { color:#183b65; font-size:16px; font-weight:700; }
.picker-label { margin-left:auto; flex-shrink:0; font-size:14px; color:#29415f; font-weight:650; }
.bot-slots .online-status { color:#167442; font-size:14px; font-weight:650; }
.bot-slots .online-status.offline { color:#758397; }
@media(max-width:600px) { .picker-label { display:none; } .slot-picker { padding:18px; } }
</style>