<script setup>
import { t } from '../i18n.js';
import { deviceIconFor } from '../deviceIcon.js';

defineProps({
  activeTab:{type:String,required:true},
  active:Boolean,
  busy:Boolean,
  deviceCount:{type:Number,default:0},
  botCount:{type:Number,default:0},
  debugDevices:{type:Array,default:()=>[]},
  deploymentServers:{type:Array,default:()=>[]},
  serviceStatus:{type:String,default:'disconnected'},
});
defineEmits(['change','rerun-mpy']);
const tabs=[
  {id:'docs',label:'开发文档',description:'指南、接口与示例',icon:'docs-book'},
  {id:'devices',label:'我的冒泡',description:'查看设备与 Bot',icon:'nav-device'},
  {id:'project',label:'选择应用',description:'目录、入口与凭据',icon:'folder'},
  {id:'debug',label:'调试运行',description:'运行状态与应用日志',icon:'terminal'},
  {id:'deploy',label:'\u90e8\u7f72\u5e94\u7528',description:'\u90e8\u7f72\u5230\u4e91\u7aef',icon:'cloud'},
];
const statusText=status=>status==='ok'?t('Studio 服务正常'):status==='error'?t('Studio 服务异常'):t('Studio 未连接');

</script>
<template>
  <aside class="flow-sidebar">
    <span class="sidebar-label">{{ t('工作台') }}</span>
    <nav class="section-tabs" :aria-label="t('工作台导航')">
      <template v-for="tab in tabs" :key="tab.id">
        <button type="button" :class="{active:activeTab===tab.id||(tab.id==='debug'&&activeTab.startsWith('device:'))}" @click="$emit('change',tab.id)">
          <span :class="['nav-icon',tab.icon]"><i></i></span>
          <span><strong>{{ t(tab.label) }}</strong><small>{{ tab.id==='devices' ? deviceCount+t(' 台设备 · ')+botCount+t(' 个 Bot') : t(tab.description) }}</small></span>
        </button>
        <slot v-if="tab.id==='project'" name="files"></slot>
        <div v-if="tab.id==='debug'&&active&&debugDevices.length" class="debug-device-tabs">
          <div v-for="device in debugDevices" :key="device.id" class="debug-device-entry" :class="{active:activeTab==='device:'+device.id}">
            <button type="button" class="debug-device-card" @click="$emit('change','device:'+device.id)">
              <span class="debug-device-image"><img v-if="deviceIconFor(device).src" :class="deviceIconFor(device).kind" :src="deviceIconFor(device).src" alt=""></span>
              <span><strong>{{ device.name||device.sn||'PixelMug' }}</strong><small>{{ device.status }}</small></span>
            </button>
            <button v-if="device.canRunMpyAgain" type="button" class="rerun-mpy-button" :disabled="busy" @click.stop="$emit('rerun-mpy',device)">{{ t('再次运行 MPY') }}</button>
          </div>
        </div>
      </template>
    </nav>
    <div class="sidebar-service"><span><i :class="serviceStatus"></i>{{ statusText(serviceStatus) }}</span></div>
  </aside>
</template>
