<script setup>
import { computed, nextTick, ref, watch } from 'vue';
const props = defineProps({
  items:{type:Array,default:()=>[]},
  paused:Boolean,
  sourceIds:{type:Array,default:()=>['bot','webapp','mpy']},
  deviceId:{type:String,default:''},
  title:{type:String,default:'实时日志'},
  description:{type:String,default:'Bot、WebApp 和设备输出持续保存到应用 debug/ 目录。'},
});
const emit = defineEmits(['toggle-pause','clear']);
const source = ref(''), level = ref(''), search = ref(''), view = ref('split');
const allSources = [
  {id:'bot',label:'Bot'},
  {id:'webapp',label:'WebApp'},
  {id:'mpy',label:'设备 · MPY'},
];
const sources = computed(()=>allSources.filter(item=>props.sourceIds.includes(item.id)));
const scopedItems = computed(()=>props.items.filter(record=>
  props.sourceIds.includes(record.source) &&
  (!props.deviceId || record.deviceId===props.deviceId)
));
const visible = computed(() => scopedItems.value.filter(record =>
  (!source.value || record.source === source.value) &&
  (!level.value || record.level === level.value) &&
  (!search.value || (record.message + ' ' + (record.deviceId || '')).toLowerCase().includes(search.value.toLowerCase())) &&
  (view.value !== 'errors' || ['warn','error'].includes(record.level))
));
const shownSources = computed(() => source.value ? sources.value.filter(item => item.id === source.value) : sources.value);
const rowsFor = id => visible.value.filter(record => record.source === id);
const stamp = value => (value || '').slice(11,19);
const message = record => (record.deviceId && !props.deviceId ? '[' + record.deviceId + '] ' : '') + record.message;
function scrollLogs(){
  if(props.paused) return;
  nextTick(() => document.querySelectorAll('.log-stream').forEach(node => { node.scrollTop = node.scrollHeight; }));
}
watch(() => props.items.length, scrollLogs);
watch(()=>props.sourceIds,()=>{ if(source.value&&!props.sourceIds.includes(source.value)) source.value=''; },{deep:true});
</script>
<template>
  <section id="log-section" class="card log-card">
    <div class="log-titlebar">
      <div><span class="eyebrow">运行现场</span><h2>{{ title }} <span id="log-count" class="count">{{ scopedItems.length }}</span></h2><p>{{ description }}</p></div>
      <div class="log-view-switch" aria-label="日志显示方式">
        <button :class="{selected:view==='split'}" @click="view='split'">{{ sources.length>1?'分端显示':'全部日志' }}</button>
        <button v-if="sources.length>1" :class="{selected:view==='timeline'}" @click="view='timeline'">统一时间线</button>
        <button :class="{selected:view==='errors'}" @click="view='errors'">只看错误</button>
      </div>
    </div>
    <div class="log-toolbar" :class="{'single-source':sources.length===1}">
      <select v-if="sources.length>1" id="source" v-model="source" aria-label="日志来源"><option value="">全部来源</option><option v-for="item in sources" :key="item.id" :value="item.id">{{ item.label }}</option></select>
      <select id="level" v-model="level" aria-label="日志级别"><option value="">全部级别</option><option>log</option><option>info</option><option>warn</option><option>error</option><option>debug</option></select>
      <input id="search" v-model="search" placeholder="搜索日志" aria-label="搜索日志">
      <button id="pause" @click="emit('toggle-pause')">{{ paused ? '恢复滚动' : '暂停滚动' }}</button>
      <button id="clear" @click="emit('clear')">清空视图</button>
    </div>
    <div id="logs" :class="['logs-workspace','view-'+view,{single:shownSources.length===1,'two-sources':shownSources.length===2}]">
      <template v-if="visible.length">
        <template v-if="view==='timeline'">
          <div class="log-panel timeline-panel">
            <div class="log-panel-head"><strong>全部运行记录</strong><span>● LIVE</span></div>
            <div class="log-stream">
              <div v-for="(record,index) in visible" :key="index" :class="['log',record.level]">
                <time>{{ stamp(record.timestamp) }}</time><span class="source">{{ record.source }}</span><span>{{ record.level }}</span><span class="message">{{ message(record) }}</span>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-for="item in shownSources" :key="item.id" :class="['log-panel','source-'+item.id]">
            <div class="log-panel-head"><strong><i></i>{{ item.label }}</strong><span>● LIVE</span></div>
            <div class="log-stream">
              <div v-for="(record,index) in rowsFor(item.id)" :key="index" :class="['log',record.level]">
                <time>{{ stamp(record.timestamp) }}</time><span>{{ record.level }}</span><span class="message">{{ message(record) }}</span>
              </div>
              <p v-if="!rowsFor(item.id).length" class="empty">暂无{{ item.label }}日志</p>
            </div>
          </div>
        </template>
      </template>
      <p v-else class="empty logs-empty">{{ scopedItems.length || source || level || search ? '没有匹配的日志。' : '等待应用输出日志…' }}</p>
    </div>
    <footer>显示最近 1000 条记录 · 完整日志持续保存到应用 debug/ 中</footer>
  </section>
</template>