<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import StageNavigation from './components/StageNavigation.vue';
import DevicePanel from './components/DevicePanel.vue';
import LogWorkspace from './components/LogWorkspace.vue';
import deviceIcon from '../assets/device-icon.png';
import { deviceIconFor } from './deviceIcon.js';
import bubbleIcon from '../assets/bubble-transparent.png';
import indexBackground from '../assets/index-bg.png';

const params = new URLSearchParams(location.hash.slice(1));
const credential = params.get('studioToken') || sessionStorage.getItem('studio-workbench-token');
if (params.has('studioToken')) {
  sessionStorage.setItem('studio-workbench-token', credential);
  params.delete('studioToken');
  history.replaceState(null, '', location.pathname + location.search + (params.size ? '#' + params : ''));
}

const state = ref(null), after = ref(0), items = ref([]), runId = ref(null);
const paused = ref(false), working = ref(false), cooldown = ref(0), polling = ref(false), launchRequested = ref(false);
const loginPanelOpen = ref(false);
const activeSection = ref('project');
const serviceStatus = ref('disconnected');
const notice = ref({visible:false,error:false,message:''});
const accountType = ref('PHONE'), accountValue = ref(''), loginCode = ref(''), creatorUrl = ref('https://connector.devjeejio.com:5443');
const botEntry = ref(''), autoRunMpy = ref(false), botToken = ref(''), botApi = ref('');
const directory = ref(null), directoryDialog = ref(null);
let lastRefresh = 0, initialized = false, pollTimer, cooldownTimer, noticeTimer;

function notify(message,error=false){
  clearTimeout(noticeTimer);
  notice.value={visible:true,error,message};
  if(!error) noticeTimer=setTimeout(()=>{ notice.value={...notice.value,visible:false}; },4000);
}
async function api(path,body){
  const response = await fetch('/api/'+path,{
    method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer '+credential,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  const result = await response.json();
  if(!response.ok) throw new Error(result.error?.message || result.error || '请求失败');
  return result;
}
async function perform(fn){
  if(working.value) return;
  working.value=true;
  try{ await fn(); }
  catch(error){ notify(error.message,true); }
  finally{ working.value=false; await pollOnce(); }
}
const fieldValue = id => document.getElementById(id)?.value ?? '';
const account = () => ({baseUrl:fieldValue('creator-url').trim(),accountType:fieldValue('account-type'),account:fieldValue('account').trim()});
async function sendCode(){ await perform(async()=>{ await api('auth/code',account()); cooldown.value=60; notify('验证码已发送，请查看手机或邮箱。'); }); }
async function login(){ await perform(async()=>{ await api('auth/login',{...account(),code:fieldValue('code').trim()}); loginCode.value=''; notify('登录成功，正在获取绑定设备。'); await refreshDevices(); }); }
async function logout(){ await perform(async()=>{ await api('auth/logout',{}); launchRequested.value=false; loginPanelOpen.value=false; items.value=[]; after.value=0; botToken.value=''; notify('已退出登录，本地调试环境已停止。'); }); }
async function refreshDevices(){ await api('devices/refresh',{}); lastRefresh=Date.now(); }
async function refresh(){ await perform(async()=>{ await refreshDevices(); notify('设备状态已更新。'); }); }

async function startRun(){
  launchRequested.value=true;
  await perform(async()=>{
    try{
      const automatic=autoRunMpy.value;
      if(state.value?.run) notify(automatic?'正在重启：先让设备进入 Python Dev，再自动上传并运行设备代码。':'正在重启：先让设备进入 Python Dev，再重新加载本地服务；设备代码等待冒泡 App 发起启动。');
      await api('run/start',{bot:botEntry.value.trim(),autoRunMpy:automatic,botToken:botToken.value,botApiBaseUrl:botApi.value.trim()});
      botToken.value='';
      notify(automatic?'智能体本地服务已启动；识别到已绑定设备后将自动上传并运行 MPY。':state.value?.project?.webRoot?'智能体本地服务已启动，请在冒泡 App 中打开本轮新链接。':'智能体本地服务已启动，请在冒泡 App 中与 Bot 交互。');
    }catch(error){
      launchRequested.value=false;
      throw error;
    }
  });
}
async function stopRun(){
  await perform(async()=>{
    notify('正在停止：等待设备重启应答，然后关闭本地服务。');
    const result=await api('run/stop',{});
    launchRequested.value=false;
    const missing=(result.devices||[]).filter(device=>device.status!=='rebootAccepted');
    notify(missing.length
      ?'本地已停止；设备停止未确认：'+missing.map(device=>device.deviceId+'：'+device.message+'。').join('；')
      :result.devices?.length?'智能体已停止：设备已应答重启请求，本地服务已关闭，日志已保留。':'智能体本地服务已停止，本轮没有需要重启的设备。',missing.length>0);
  });
}
async function copyUrl(){ await perform(async()=>{ await navigator.clipboard.writeText(state.value?.run?.webAppUrl||''); notify('已复制 WebApp 链接，请在冒泡 App 中打开。'); }); }
async function runDevice(row){
  await perform(async()=>{
    await api(row.binding?'run/device':'run/rerun',row.binding?{bindingId:row.binding.bindingId}:{launchId:row.job.launchId});
    notify('正在更新设备代码，请查看设备进度和日志。');
  });
}

const project = computed(()=>state.value?.project);
const active = computed(()=>Boolean(state.value?.run));
const projectName = computed(()=>project.value?.path?.split(/[\\/]/).filter(Boolean).pop() || '');
const latestJobs = computed(()=>[...(state.value?.events?.launches||[])].reverse());
const deploymentSteps=['进入开发模式','连接设备','上传设备代码','应用开始运行'];
function deploymentIndexFor(job){ const value=job?.state; if(!value) return -1; if(['accepted','rebooting'].includes(value)) return 0; if(value==='connecting') return 1; if(['uploading','uploaded'].includes(value)) return 2; if(['running','completed'].includes(value)) return 3; return -1; }
const bot = computed(()=>state.value?.events?.bot);
const botAlive = computed(()=>Boolean(bot.value && bot.value.exitCode===null && !bot.value.signal));
const pixelMugOnline = computed(()=>{
  const online=value=>value===true||value===1||value==='1'||String(value||'').toUpperCase()==='ONLINE';
  return (state.value?.devices||[]).some(device=>online(device.online)) ||
    bindings.value.some(binding=>online(binding.device?.online));
});
const bindings = computed(()=>state.value?.events?.bindings||[]);
const jobs = computed(()=>state.value?.events?.launches||[]);
const launchRows = computed(()=>{
  const rows=bindings.value.map(binding=>({binding,job:latestJobs.value.find(job=>job.device.deviceId===binding.device.deviceId)}));
  for(const job of jobs.value) if(!bindings.value.some(binding=>binding.device.deviceId===job.device.deviceId)) rows.push({job});
  for(const plan of state.value?.events?.restarts||[]) if(!jobs.value.some(job=>job.device.deviceId===plan.deviceId)) rows.push({plan});
  return rows;
});
const labels={accepted:'准备代码',rebooting:'重启设备',connecting:'连接设备',uploading:'上传文件',uploaded:'上传完成',running:'设备应用已启动',failed:'失败',completed:'执行结束',stopped:'已中止',unknown:'状态未知',superseded:'已被新任务替代'};
const deviceProcessStatus=job=>{
  if(!project.value?.mpy) return '可以运行，无需加载代码';
  if(!job) return '已绑定，等待运行';
  if(['accepted','rebooting'].includes(job.state)) return '进入开发模式';
  if(job.state==='connecting') return '连接设备';
  if(['uploading','uploaded'].includes(job.state)) return '上传设备代码';
  if(job.state==='running') return '应用开始运行';
  return labels[job.state]||job.state;
};
const debugDevices=computed(()=>{
  const seen=new Set(), result=[];
  for(const binding of bindings.value){
    const device=binding.device||{}, id=device.deviceId;
    if(!id||seen.has(id)) continue;
    seen.add(id);
    const accountDevice=(state.value?.devices||[]).find(item=>item.id===id)||{};
    const job=latestJobs.value.find(item=>item.device?.deviceId===id);
    result.push({id,name:device.name||accountDevice.name||device.sn||accountDevice.sn||'PixelMug',sn:device.sn||accountDevice.sn||'',status:deviceProcessStatus(job),binding,job});
  }
  return result;
});
const selectedDeviceId=computed(()=>activeSection.value.startsWith('device:')?activeSection.value.slice(7):'');
const selectedDevice=computed(()=>debugDevices.value.find(device=>device.id===selectedDeviceId.value));
const selectedDeviceRow=computed(()=>launchRows.value.find(row=>rowDevice(row)?.deviceId===selectedDeviceId.value));
const selectedDeviceJob=computed(()=>latestJobs.value.find(job=>job.device?.deviceId===selectedDeviceId.value));
const selectedDeviceNetwork=computed(()=>selectedDeviceRow.value?.job?.network||latestJobs.value.find(job=>job.device?.deviceId===selectedDeviceId.value&&job.network)?.network);
const selectedDeviceIcon=computed(()=>deviceIconFor(selectedDevice.value));
const selectedDeploymentIndex=computed(()=>deploymentIndexFor(selectedDeviceJob.value));
const applicationLogSources=computed(()=>project.value?.webRoot?['bot','webapp']:['bot']);
const webAppReady=computed(()=>Boolean(state.value?.run?.webAppUrl));
const deviceCodeRunning=computed(()=>jobs.value.some(job=>job.state==='running'));
const topologyWebAddress=computed(()=>`http://${state.value?.webAppHostname||'pixelmug-studio.local'}:${state.value?.webAppPort||7979}`);
watch([active,debugDevices],([running,devices])=>{
  if(activeSection.value.startsWith('device:')&&(!running||!devices.some(device=>device.id===selectedDeviceId.value))) activeSection.value='debug';
});
function networkText(network){
  if(!network) return 'Wi-Fi / IP：待获取（运行设备时查询）';
  return `Wi-Fi：${network.ssid||'名称未获取'} · IP：${network.ip||'未获取'}`+
    (network.wifiConnected===false?' · Wi-Fi 未连接':'')+
    ` · 最近获取 ${new Date(network.updatedAt).toLocaleTimeString()}`;
}
function rowDevice(row){ return row.binding?.device || row.job?.device; }
function rowState(row){ return row.plan?.state || row.job?.state || 'bound'; }
function rowTitle(row){ return row.plan ? (row.plan.state==='failed'?'智能体重启未完成':'等待恢复设备运行') : row.job ? labels[row.job.state]||row.job.state : '已绑定，尚未运行'; }
function rowDisabled(row){
  if(row.plan) return true;
  return working.value || !project.value?.mpy || !botAlive.value ||
    (row.binding ? !row.binding.available : row.job?.canRerun===false) ||
    Boolean(row.job && !['running','failed','completed','stopped','unknown'].includes(row.job.state));
}
const configurationErrors = computed(()=>{
  if(!project.value) return [];
  const errors=[];
  if(!botEntry.value.trim()) errors.push('尚未指定冒泡 Bot 入口文件。');
  if(!botToken.value.trim()&&!state.value?.runtimeConfig?.hasBotToken) errors.push('尚未设置 Bot token。');
  return errors;
});
const readyDescription = computed(()=>{
  const messages=['Studio 将启动运行 bot'];
  if(project.value?.webRoot) messages.push('为 webapp 提供访问地址');
  if(project.value?.mpy) messages.push(autoRunMpy.value?'Studio 将自动为设备加载代码并运行':'Studio 不会自动为设备加载代码，请使用智能体本身加载和运行设备代码');
  return messages.join('，')+'。';
});
const runStatusDescription=computed(()=>{
  const messages=[botAlive.value?'bot已经启动运行':'bot正在启动'];
  if(project.value?.webRoot) messages.push(state.value?.run?.webAppUrl?'Webapp服务已经启动':'Webapp服务正在启动');
  if(project.value?.mpy){
    const running=jobs.value.some(job=>job.state==='running');
    const loading=jobs.value.some(job=>['accepted','rebooting','connecting','uploading','uploaded'].includes(job.state));
    const failed=jobs.value.some(job=>job.state==='failed');
    if(running) messages.push('设备代码已经运行');
    else if(loading) messages.push('设备代码正在加载');
    else if(failed) messages.push('设备代码运行失败，请查看对应设备日志');
    else if((launchRequested.value?autoRunMpy.value:state.value?.runtimeConfig?.autoRunMpy===true)) messages.push(bindings.value.length?'Studio正在为设备加载代码':'正在等待获取已绑定设备');
  }
  return messages.join('，')+'。';
});
const runStarted=computed(()=>active.value||launchRequested.value);
const guideLinksToProject = computed(()=>!project.value||(!runStarted.value&&configurationErrors.value.length>0));
const guide = computed(()=>{
  const errors=[];
  if(!project.value) return {stage:0,title:'请选择加载运行的应用',body:'选择本机保存的项目目录，加载运行',errors};
  if(!runStarted.value){
    if(configurationErrors.value.length) return {stage:1,title:'请重新检查智能体应用',body:'以下配置不符合运行条件：',errors:configurationErrors.value};
    return {stage:1,title:'可以启动智能体',body:readyDescription.value,errors};
  }
  return {stage:3,title:'智能体已启动，开始使用和测试吧',body:runStatusDescription.value,errors};
});
const operationHint = computed(()=>active.value
  ? state.value?.runtimeConfig?.autoRunMpy?'重启会让本轮设备进入 Python Dev，并自动上传、运行 MPY。停止会请求设备普通重启。':'重启会让本轮设备进入 Python Dev 并重新加载本地服务；MPY 等待冒泡 App 发起启动后上传。停止会请求设备普通重启。'
  : project.value?'启动本地 Bot 与可选 WebApp 服务，再到冒泡 App 中体验。':'先打开本地项目，再启动智能体。');
const startDisabled=computed(()=>working.value||!project.value||!state.value?.user||configurationErrors.value.length>0||active.value);
const restartDisabled=computed(()=>working.value||!active.value);
const projectComposition=computed(()=>project.value?'应用组成：'+['bot',...(project.value.webRoot?['WebApp']:[]),...(project.value.mpy?['MPY']:[])].join(' + '):'');

async function browse(path){
  const data=await api('directories'+(path?'?path='+encodeURIComponent(path):''));
  directory.value=data;
}
async function openDirectory(){ await perform(async()=>{ await browse(project.value?.path); directoryDialog.value.showModal(); }); }
async function browseAction(path){ await perform(()=>browse(path)); }
async function chooseDirectory(){ await perform(async()=>{ await api('project/open',{path:directory.value.path}); activeSection.value='debug'; directoryDialog.value.close(); notify('项目已打开，请检查运行入口与 bot 配置。'); }); }

function applyState(data){
  const previousPath=state.value?.project?.path;
  state.value=data;
  if(data.run) launchRequested.value=false;
  if(!initialized) creatorUrl.value=data.creatorUrl;
  if(!initialized || previousPath!==data.project?.path){
    botEntry.value=data.project?.bot||'';
    autoRunMpy.value=Boolean(data.project?.mpy && data.runtimeConfig?.autoRunMpy);
    botApi.value=data.runtimeConfig?.botApiBaseUrl||'';
  }
  if(data.events){
    if(runId.value!==data.events.runId){ runId.value=data.events.runId; items.value=[]; after.value=0; }
    items.value=items.value.concat(data.events.records).slice(-1000);
    after.value=data.events.cursor;
    if(data.events.truncated) notify('部分较早日志已超出显示窗口，完整记录仍在 debug/ 目录中。');
  }
  initialized=true;
}
async function pollOnce(){
  if(!credential || polling.value) return;
  polling.value=true;
  try{ applyState(await api('state?after='+after.value+'&runId='+encodeURIComponent(runId.value||''))); serviceStatus.value='ok'; }
  catch(error){ serviceStatus.value='error'; notify(error.message,true); }
  finally{ polling.value=false; }
}
onMounted(async()=>{
  if(!credential) notify('请使用启动终端提供的完整 Studio 地址打开页面。',true);
  await pollOnce();
  pollTimer=setInterval(async()=>{ await pollOnce(); if(state.value?.user&&!working.value&&Date.now()-lastRefresh>15000){ lastRefresh=Date.now(); try{ await refreshDevices(); }catch(error){ notify(error.message,true); } } },1000);
  cooldownTimer=setInterval(()=>{ if(cooldown.value>0) cooldown.value--; },1000);
});
onBeforeUnmount(()=>{ clearInterval(pollTimer); clearInterval(cooldownTimer); clearTimeout(noticeTimer); });
</script>

<template>
  <header class="app-header" :hidden="!state?.user">
    <div class="brand"><span class="mark"><img :src="deviceIcon" alt="PixelMug"></span><div>PixelMug <b>Studio</b><small>DEVELOPER WORKSPACE</small></div></div>
    <div class="header-right"><span id="user-name">{{ state?.user?.name || '' }}</span><button id="logout" :hidden="!state?.user" :disabled="working" @click="logout">退出登录</button></div>
  </header>
  <div id="notice" role="status" aria-live="polite" :hidden="!notice.visible" :class="{error:notice.error}">{{ notice.message }}</div>

  <section id="login-view" class="login-shell" :hidden="Boolean(state?.user)" :style="{backgroundImage:`url(${indexBackground})`}">
    <div v-if="!loginPanelOpen" class="login-hero">
      <p class="login-slogan">Bring your ideas to life on PixelMug</p>
      <h1>让每一个灵感<br>在 PixelMug 上运行</h1>
      <button type="button" class="bubble-login-button" @click="loginPanelOpen=true">用冒泡账号登录</button>
    </div>
    <form v-else id="login-form" class="login-panel" @submit.prevent="login">
      <span class="eyebrow">冒泡账号</span>
      <h2>登录 PixelMug Studio</h2>
      <p class="login-description">登录后自动获取你绑定的设备。</p>
      <label>账号类型<select id="account-type" v-model="accountType"><option value="PHONE">手机号</option><option value="EMAIL">邮箱</option></select></label>
      <label>手机号 / 邮箱<input id="account" v-model="accountValue" autocomplete="username" required placeholder="输入冒泡账号"></label>
      <label>登录验证码<div class="inline"><input id="code" v-model="loginCode" autocomplete="one-time-code" required placeholder="输入验证码"><button id="send-code" type="button" :disabled="working||cooldown>0" @click="sendCode">{{ cooldown>0 ? cooldown+'s 后重试' : '获取验证码' }}</button></div></label>
      <input id="creator-url" v-model="creatorUrl" type="hidden">
      <button class="primary wide" id="login" type="submit" :disabled="working">登录 Studio →</button>
    </form>
  </section>

  <main id="workspace" :hidden="!state?.user">
    <StageNavigation :active-tab="activeSection" :active="active" :device-count="state?.devices?.length||0" :debug-devices="debugDevices" :service-status="serviceStatus" @change="activeSection=$event"/>
    <section class="workspace-content">
      <div class="workspace-heading">
        <div><span class="eyebrow">冒泡智能体 · 开发工作台</span><h1 v-if="projectName" id="project-name">{{ projectName }}</h1></div>
        <span id="run-status" class="badge">{{ active ? '本地服务已启动' : '尚未启动' }}</span>
      </div>

      <section v-show="activeSection==='devices'" class="section-page devices-page">
        <div class="section-intro"><div><span class="eyebrow">MY DEVICES</span><h2>我的设备</h2><p>查看当前冒泡账号绑定的全部 PixelMug 及在线状态。</p></div><button id="refresh-devices" :disabled="working" @click="refresh">刷新设备</button></div>
        <DevicePanel class="devices-full" :devices="state?.devices||[]" :latest-jobs="latestJobs" :bindings="bindings" :active="active">
          <template #updated><p id="device-updated" class="subtle">{{ state?.devicesUpdatedAt ? '状态更新时间： '+new Date(state.devicesUpdatedAt).toLocaleTimeString() : '状态更新时间：尚未获取' }}</p></template>
        </DevicePanel>
      </section>

      <section v-show="activeSection==='project'" class="section-page project-page">
        <div class="section-intro"><div><span class="eyebrow">PROJECT</span><h2>智能体应用</h2><p>打开本地应用目录，确认冒泡Bot入口，配置运行参数</p></div><button id="browse" class="primary" :disabled="working||active" @click="openDirectory">打开应用目录</button></div>
        <section class="card project-editor">
          <div class="project-summary">
            <div class="project-folder-icon"></div>
            <div><span class="eyebrow">当前应用</span><h2 v-if="projectName">{{ projectName }}</h2><p id="project-path" class="path muted">{{ project?.path || '尚未打开应用' }}</p><p id="project-check" class="subtle">{{ projectComposition }}</p></div>
          </div>
          <div class="project-divider"></div>
          <details id="project-settings" open>
            <summary>运行配置</summary>
            <div class="settings-grid">
              <label>Bot 入口<input id="bot-entry" v-model="botEntry" placeholder="bot/index.js"><small>必须是 bot/ 目录中的 .js、.mjs 或 .cjs 文件。</small></label>
              <label>Bot token<input id="bot-token" v-model="botToken" type="password" autocomplete="off" :placeholder="state?.runtimeConfig?.hasBotToken?'本地后台已保存，留空沿用':'已设置环境变量时可留空'"><small>只保存在本地 Studio 进程中。</small></label>
              <label>Bot API 地址（可选）<input id="bot-api" v-model="botApi" placeholder="使用 SDK 默认地址"><small>仅在连接自定义 Bot 服务时填写。</small></label>
              <label class="check-option auto-run-option"><input id="auto-run-mpy" v-model="autoRunMpy" type="checkbox" :disabled="working||!project?.mpy||active"><span><strong>启动后自动运行设备代码</strong><small>开启后，运行智能体时，Studio 会自动加载并运行 PixelMug 端代码。</small></span></label>
            </div>
          </details>
          <p class="project-requirements">冒泡智能体应用至少应包含 bot/ 目录及智能体启动入口；还可包含 webapp/ 目录和 mpy/ 设备代码目录。包含设备代码时，请在 mpy/ 目录中使用 <code>__main__.py</code> 作为执行入口。</p>
        </section>
      </section>

      <section v-if="activeSection==='debug'" class="section-page debug-page">
        <div class="section-intro debug-intro"><div><span class="eyebrow">DEBUG</span><h2>调试运行</h2><p>启动智能体，在真实硬件上部署运行，观察运行日志</p></div><div class="actions"><button id="start" class="primary" :disabled="startDisabled" @click="startRun">{{ working&&!active?'请稍候…':'启动智能体' }}</button><button id="restart" :disabled="restartDisabled" @click="startRun">重启智能体</button><button id="stop" :disabled="restartDisabled" @click="stopRun">停止智能体</button></div></div>

        <section class="next-step" :class="{invalid:guide.errors?.length}" aria-live="polite"><span class="guide-icon"></span><div><span class="eyebrow">当前状态</span><h2 id="guide-title"><a v-if="guideLinksToProject" class="guide-title-link" href="#" @click.prevent="activeSection='project'">{{ guide.title }}</a><template v-else>{{ guide.title }}</template></h2><p id="guide-body">{{ guide.body }}</p><ul v-if="guide.errors?.length" class="configuration-errors"><li v-for="error in guide.errors" :key="error">{{ error }}</li></ul></div><p v-if="!runStarted&&!guide.errors?.length" id="operation-hint" class="operation-hint">{{ operationHint }}</p></section>

        <section v-if="project" class="card runtime-card">
          <div class="section-heading"><div><span class="eyebrow">RUNTIME</span><h2>运行状态</h2></div><span class="topology-status">{{ active?'智能体运行中':'等待启动' }}</span></div>
          <div class="runtime-topology" :class="{active}">
            <svg class="topology-lines" viewBox="0 0 1000 430" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="topology-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z"></path></marker>
                <marker id="topology-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z"></path></marker>
              </defs>
              <path class="network-link" :class="{online:botAlive}" d="M190 245 L500 91"></path>
              <path class="network-link" d="M500 245 L500 91"></path>
              <path class="network-link" :class="{online:pixelMugOnline}" d="M810 245 L500 91"></path>
              <text class="network-label" x="325" y="154">Internet</text>
              <text class="network-label" x="514" y="165">Internet</text>
              <text class="network-label" x="675" y="154">Internet</text>
             <path v-if="webAppReady" class="service-link lan-link web-link" d="M245 318 C330 355 410 355 455 318"></path>
              <text v-if="webAppReady" class="service-label" x="350" y="369" text-anchor="middle">{{ topologyWebAddress }}</text>
              <path v-if="deviceCodeRunning" class="service-link lan-link mpy-link" d="M245 338 C405 416 650 416 755 338"></path>
           </svg>

            <div class="topology-node cloud-node"><span class="topology-symbol cloud-symbol">☁</span><strong>bubble cloud service</strong></div>
            <div class="lan-boundary"><span>LAN</span></div>
            <div class="topology-node pc-node"><span class="topology-symbol pc-symbol"><i></i></span><strong>PixelMug Studio</strong><div class="service-badges"><span v-if="botAlive" class="service-badge">BOT</span><span v-if="webAppReady" class="service-badge">WebApp</span></div></div>
            <div class="topology-node phone-node"><span class="topology-symbol phone-symbol"><i></i><img class="bubble-app-icon" :src="bubbleIcon" alt=""></span><strong>Bubble App</strong></div>
            <div class="topology-node mug-node"><span class="topology-symbol mug-symbol"><img :src="deviceIcon" alt=""></span><strong>PixelMug</strong><div v-if="deviceCodeRunning" class="service-badges"><span class="service-badge">MPY</span><small>代码安装成功</small></div></div>
          </div>
          
          <details class="diagnostics"><summary>连接与运行详情</summary><div id="web-link-panel" :hidden="!state?.run?.webAppUrl"><label>Studio为Webapp提供的局域网访问地址：<div class="inline"><input id="web-url" :value="state?.run?.webAppUrl||''" readonly><button id="copy-url" @click="copyUrl">复制链接</button></div></label></div><p id="network-info" class="subtle">请确保运行Studio的电脑、运行冒泡App的手机和PixelMug在同一个局域网</p><p>本轮运行 <span id="run-id" class="mono muted">{{ state?.run?.runId||'—' }}</span></p><p id="debug-dir" class="path subtle">{{ active?'日志目录：'+state.run.debugDir:'' }}</p></details>
        </section>

        <LogWorkspace v-if="project" :items="items" :paused="paused" :source-ids="applicationLogSources" title="应用运行日志" description="Bot 和 WebApp 输出持续保存到应用 debug/ 目录。" @toggle-pause="paused=!paused" @clear="items=[]"/>
      </section>

      <section v-if="active&&selectedDevice" class="section-page device-debug-page">
        <section class="card device-overview-card">
          <div class="device-overview-image"><img :class="selectedDeviceIcon.kind" :src="selectedDeviceIcon.src" :alt="selectedDeviceIcon.model"></div>
          <div class="device-overview-content">
            <span class="eyebrow">DEVICE</span>
            <h2>{{ selectedDevice.name }}</h2>
            <div class="device-facts">
              <div><span>Wi-Fi</span><strong>{{ selectedDeviceNetwork?.ssid||'待获取' }}</strong></div>
              <div><span>IP 地址</span><strong>{{ selectedDeviceNetwork?.ip||'待获取' }}</strong></div>
              <div><span>最近获取时间</span><strong>{{ selectedDeviceNetwork?.updatedAt?new Date(selectedDeviceNetwork.updatedAt).toLocaleTimeString():'待获取' }}</strong></div>
              <div><span>Bot 绑定位置</span><strong>槽位 {{ rowDevice(selectedDeviceRow).slot }}</strong></div>
            </div>
          </div>
          <details v-if="project?.mpy" class="device-actions"><summary>设备高级操作</summary><p class="subtle">单独部署 MPY，不重启本地服务。设备将重启，旧应用及数据会被清除，保留引导配置。</p><button :disabled="rowDisabled(selectedDeviceRow)" @click="runDevice(selectedDeviceRow)">{{ selectedDeviceRow.job?'更新并运行设备代码':'上传并运行设备代码' }}</button></details>
        </section>

        <section v-if="project?.mpy" class="card process-card">
          <div class="section-heading"><div><span class="eyebrow">DEVICE PROCESS</span><h2>设备运行过程</h2></div><span class="process-state">{{ selectedDevice.status }}</span></div>
          <div class="deployment-track">
            <div v-for="(step,index) in deploymentSteps" :key="step" :class="['deployment-step',{done:selectedDeploymentIndex>index,current:selectedDeploymentIndex===index}]">
              <span>{{ selectedDeploymentIndex>index?'✓':index+1 }}</span><strong>{{ step }}</strong><small>{{ selectedDeploymentIndex>index?'已完成':selectedDeploymentIndex===index?'进行中':'等待' }}</small>
            </div>
          </div>
        </section>

        <LogWorkspace v-if="project?.mpy" :items="items" :paused="paused" :source-ids="['mpy']" :device-id="selectedDevice.id" title="设备运行日志" :description="selectedDevice.name+' 的 MPY 输出持续保存到应用 debug/ 目录。'" @toggle-pause="paused=!paused" @clear="items=[]"/>
      </section>
    </section>
  </main>
  <dialog id="directory-dialog" ref="directoryDialog"><div class="section-heading"><h2>打开本地项目</h2><button id="close-directory" aria-label="关闭目录浏览器" @click="directoryDialog.close()">×</button></div><div class="inline"><input id="directory-path" :value="directory?.path||''" @input="directory={...directory,path:$event.target.value}" @keydown.enter.prevent="browseAction(directory?.path)"><button id="directory-go" @click="browseAction(directory?.path)">转到</button><button id="directory-up" @click="browseAction(directory?.parent)">上一级</button></div><div id="drives" class="actions"><button v-for="drive in directory?.drives||[]" :key="drive" @click="browseAction(drive)">{{ drive }}</button></div><div id="directories"><button v-for="item in directory?.directories||[]" :key="item.path" @click="browseAction(item.path)">▸　{{ item.name }}</button><p v-if="directory&&!directory.directories.length" class="empty">此目录没有可浏览的子目录。</p></div><div class="dialog-footer"><button id="choose-directory" class="primary" @click="chooseDirectory">使用当前目录</button></div></dialog>
</template>




