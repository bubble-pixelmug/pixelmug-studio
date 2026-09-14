<script setup>
import { deviceIconFor } from '../deviceIcon.js';

defineProps({
  activeTab:{type:String,required:true},
  active:Boolean,
  deviceCount:{type:Number,default:0},
  debugDevices:{type:Array,default:()=>[]},
  serviceStatus:{type:String,default:'disconnected'},
});
defineEmits(['change']);
const tabs=[
  {id:'devices',label:'我的设备',description:'查看账号绑定设备',icon:'nav-device'},
  {id:'project',label:'选择应用',description:'目录、入口与凭据',icon:'folder'},
  {id:'debug',label:'调试运行',description:'运行状态与应用日志',icon:'terminal'},
];
const statusText=status=>status==='ok'?'Studio 服务正常':status==='error'?'Studio 服务异常':'Studio 未连接';

</script>
<template>
  <aside class="flow-sidebar">
    <span class="sidebar-label">工作台</span>
    <nav class="section-tabs" aria-label="工作台导航">
      <template v-for="tab in tabs" :key="tab.id">
        <button type="button" :class="{active:activeTab===tab.id||(tab.id==='debug'&&activeTab.startsWith('device:'))}" @click="$emit('change',tab.id)">
          <span :class="['nav-icon',tab.icon]"><i></i></span>
          <span><strong>{{ tab.label }}</strong><small>{{ tab.id==='devices' ? deviceCount+' 台账号设备' : tab.description }}</small></span>
        </button>
        <div v-if="tab.id==='debug'&&active&&debugDevices.length" class="debug-device-tabs">
          <button v-for="device in debugDevices" :key="device.id" type="button" :class="{active:activeTab==='device:'+device.id}" @click="$emit('change','device:'+device.id)">
            <span class="debug-device-image"><img v-if="deviceIconFor(device).src" :class="deviceIconFor(device).kind" :src="deviceIconFor(device).src" alt=""></span>
            <span><strong>{{ device.name||device.sn||'PixelMug' }}</strong><small>{{ device.status }}</small></span>
          </button>
        </div>
      </template>
    </nav>
    <div class="sidebar-service"><span><i :class="serviceStatus"></i>{{ statusText(serviceStatus) }}</span></div>
  </aside>
</template>