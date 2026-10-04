<script setup>
import { t } from '../i18n.js';
import { deviceIconFor as iconFor } from '../deviceIcon.js';

const props=defineProps({
  devices:{type:Array,default:()=>[]},
  latestJobs:{type:Array,default:()=>[]},
  bindings:{type:Array,default:()=>[]},
  active:Boolean,
});
const networkText=network=>{
  if(!network) return t('Wi-Fi / IP：待获取');
  return t('Wi-Fi：{0} · IP：{1}', [network.ssid||t('名称未获取'), network.ip||t('未获取')])+
    (network.wifiConnected===false?t(' · Wi-Fi 未连接'):'');
};
const bindingFor=device=>props.bindings.find(binding=>binding.device?.deviceId===device.id);
const jobFor=device=>props.latestJobs.find(job=>job.device?.deviceId===device.id);
const isBound=device=>props.active&&Boolean(bindingFor(device)||jobFor(device));


</script>
<template>
  <section class="card device-panel">
    <div class="section-heading">
      <div><span class="eyebrow">{{ t('真实设备') }}</span><h2>{{ t('账号设备 ') }}<span class="count">{{ devices.length }}</span></h2></div>
      <slot name="action"></slot>
    </div>


    <div id="devices" class="device-list">
      <article v-for="device in devices" :key="device.id" :class="['device-card',{bound:isBound(device)}]">
        <div class="device-image"><img v-if="iconFor(device).src" :class="iconFor(device).kind" :src="iconFor(device).src" :alt="iconFor(device).model"></div>
        <div class="device-content">
          <div class="device-top">
            <strong>{{ device.name }}</strong>
            <span v-if="isBound(device)" class="bound-status">{{ t('已与智能体关联') }}</span>
            <span v-else class="online-status" :class="{offline:device.online!=='ONLINE'}">{{ device.online==='ONLINE'?t('● 在线'):t('○ 离线') }}</span>
          </div>
          <div class="device-serial">SN {{ device.sn||'—' }}</div>
          <div class="device-serial">TALID：{{ device.talId||'—' }}</div>
          <div v-if="isBound(device)" class="bound-details">
            <span class="online-status" :class="{offline:device.online!=='ONLINE'}">{{ device.online==='ONLINE'?t('● 在线'):t('○ 离线') }}</span>
            <span>{{ networkText(jobFor(device)?.network) }}</span>
          </div>
        </div>
      </article>
      <p v-if="!devices.length" class="empty">{{ t('暂无设备，请在冒泡 App 绑定后刷新。') }}</p>
    </div>
    <div class="device-footer">
      <p class="subtle device-explain">{{ t('智能体应用可以驱动一个或多个设备，并且可以由用户在冒泡 App 中动态绑定。') }}</p>
      <slot name="updated"></slot>
    </div>
  </section>
</template>