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
const origin = ref('');
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
  (!origin.value || record.source !== 'mpy' || record.kind === origin.value) &&
  (!level.value || record.level === level.value) &&
  (!search.value || (record.message + ' ' + (record.deviceId || '')).toLowerCase().includes(search.value.toLowerCase())) &&
  (view.value !== 'errors' || ['warn','error'].includes(record.level))
));
const shownSources = computed(() => source.value ? sources.value.filter(item => item.id === source.value) : sources.value);
const rowsFor = id => visible.value.filter(record => record.source === id);
const originLabel = record => record.kind==='console'?'程序':record.kind==='studio'?'系统':'未分类';
const rowClasses = record => ['log',record.level,record.source==='mpy'?'mpy-log origin-'+record.kind:'',{'lifecycle-row':Boolean(lifecycleLabel(record))}];
const lifecycleLabel = record => ({running:'程序开始运行',completed:'程序运行结束',stopped:'程序已停止',failed:'程序异常结束',unknown:'程序状态未知'})[record.lifecycle];
const stamp = value => (value || '').slice(11,19);
const message = record => (record.deviceId && !props.deviceId ? '[' + record.deviceId + '] ' : '') + record.message;
function scrollLogs(){
  if(props.paused) return;
  nextTick(() => document.querySelectorAll('.log-stream').forEach(node => { node.scrollTop = node.scrollHeight; }));
}
function handoffUpwardScroll(event){
  if(event.deltaY >= 0) return;
  const page = event.currentTarget.closest('.workspace-content');
  if(!page || page.scrollTop <= 0) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? page.clientHeight : 1;
  page.scrollTop += event.deltaY * unit;
}
watch(() => props.items.length, scrollLogs);
watch([origin,level,source,search,view],scrollLogs);
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
    <div v-if="sources.some(item=>item.id==='mpy')" class="mpy-origin-filter" role="group" aria-label="设备日志来源">
      <button v-for="item in [{id:'',label:'全部'},{id:'console',label:'程序'},{id:'studio',label:'系统'}]" :key="item.id" :class="{selected:origin===item.id}" :aria-pressed="origin===item.id" @click="origin=item.id">{{ item.label }}</button>
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
            <div class="log-stream" @wheel="handoffUpwardScroll">
              <div v-for="(record,index) in visible" :key="index" :class="rowClasses(record)">
                <time>{{ stamp(record.timestamp) }}</time><span class="source">{{ record.source }}</span><span>{{ record.level }}</span><span v-if="record.source==='mpy'" class="log-origin">{{ originLabel(record) }}</span><span class="message"><strong v-if="lifecycleLabel(record)" class="lifecycle-label">{{ lifecycleLabel(record) }}</strong>{{ message(record) }}</span>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-for="item in shownSources" :key="item.id" :class="['log-panel','source-'+item.id]">
            <div class="log-panel-head"><strong><i></i>{{ item.label }}</strong><span>● LIVE</span></div>
            <div class="log-stream" @wheel="handoffUpwardScroll">
              <div v-for="(record,index) in rowsFor(item.id)" :key="index" :class="rowClasses(record)">
                <time>{{ stamp(record.timestamp) }}</time><span>{{ record.level }}</span><span v-if="record.source==='mpy'" class="log-origin">{{ originLabel(record) }}</span><span class="message"><strong v-if="lifecycleLabel(record)" class="lifecycle-label">{{ lifecycleLabel(record) }}</strong>{{ message(record) }}</span>
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
<style scoped>
.mpy-origin-filter{display:flex;gap:4px;padding:0 23px 12px}.mpy-origin-filter button{padding:6px 16px;font-size:12px;border:1px solid #d6e3f3;background:#f6f9fd;color:#526b89}.mpy-origin-filter button.selected{background:#1263c5;color:white;border-color:#1263c5}
.log-stream{font-size:12px;line-height:1.8}.log{grid-template-columns:64px 44px minmax(0,1fr);border-bottom:0;background:transparent;padding:6px 10px}.timeline-panel .log{grid-template-columns:64px 62px 44px minmax(0,1fr)}.log.mpy-log{grid-template-columns:64px 44px 42px minmax(0,1fr)}.timeline-panel .log.mpy-log{grid-template-columns:64px 62px 44px 42px minmax(0,1fr)}
.log.origin-studio{color:#8fa7bf}.log.origin-console{color:#eef6ff}.log-origin{font-size:12px;align-self:start;text-align:center;color:inherit}.origin-console .log-origin{color:#86e3b6}
.log.lifecycle-row{border-top:1px solid #38516b;border-bottom:0;margin:10px 0 4px;background:transparent}.lifecycle-label{display:block;color:#bdd9f8;font-size:13px;margin-bottom:2px}
.log.error,.log.error .log-origin,.log.error .lifecycle-label{color:#ff9d9d}.log.error{border-left-color:#ff6868;background:transparent}.log.warn,.log.warn .log-origin,.log.warn .lifecycle-label{color:#ffd08a}
</style>
