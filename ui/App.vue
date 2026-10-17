<script setup>
import { t, serviceMessage, language } from './i18n.js';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import StageNavigation from './components/StageNavigation.vue';
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import DocumentationPanel from './components/DocumentationPanel.vue';
const FileWorkspace = defineAsyncComponent(() => import('./components/FileWorkspace.vue'));
import DevicePanel from './components/DevicePanel.vue';
import BotSlots from './components/BotSlots.vue';
import BotPanel from './components/BotPanel.vue';
import LogWorkspace from './components/LogWorkspace.vue';
import deviceIcon from './assets/device-icon.png';
import { deviceIconFor } from './deviceIcon.js';
import bubbleIcon from './assets/bubble-transparent.png';
import indexBackground from './assets/index-bg.png';
import cloudServerIcon from './assets/cloud-server.png';

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
const fileWorkspace = ref(null);
const serviceStatus = ref('disconnected');
const notice = ref({visible:false,error:false,message:''});
const accountType = ref('PHONE'), accountValue = ref(''), loginCode = ref(''), creatorUrl = ref('https://us-connector.jeejio.com');
const botEntry = ref(''), autoRunMpy = ref(false), botApi = ref('');
const directory = ref(null), directoryDialog = ref(null);
const deploymentServers = ref([]), selectedServerId = ref(null), deploymentMpsId = ref(''), deploymentBusy = ref(false), deploymentLog = ref([]), deploymentProjectInfo = ref(null), deploymentBotId = ref('');
const deploymentRemoteLogKeys = new Set();
const deploymentLogElement = ref(null);
const deploymentTextMap = {
  deployApplication: ['\u90e8\u7f72\u5e94\u7528', 'Deploy application'],
  cloudServers: ['\u6211\u7684\u4e91\u670d\u52a1\u5668', 'My cloud servers'],
  description: ['\u5c06\u5f53\u524d\u5728 Studio \u4e2d\u6253\u5f00\u7684\u9879\u76ee\u90e8\u7f72\u5230\u4e91\u670d\u52a1\u5668\u3002', 'Deploy the project currently open in Studio to an cloud server.'],
  refresh: ['\u5237\u65b0', 'Refresh'], applyServer: ['\u7533\u8bf7\u670d\u52a1\u5668', 'Apply server'],
  management: ['\u90e8\u7f72\u7ba1\u7406', 'Deployment management'], currentProject: ['\u5f53\u524d\u9879\u76ee', 'Current project'],
  loadProject: ['\u52a0\u8f7d\u9879\u76ee\u4fe1\u606f', 'Load project information'], project: ['\u9879\u76ee', 'Project'],
  deploymentId: ['\u90e8\u7f72 ID', 'Deployment ID'], notCreated: ['\u672a\u521b\u5efa', 'Not created'], notLoaded: ['\u672a\u52a0\u8f7d', 'Not loaded'],
  bot: ['Bot', 'Bot'], selectBot: ['\u9009\u62e9 Bot', 'Select a Bot'], name: ['\u540d\u79f0', 'Name'], id: ['ID', 'ID'],
  mps: ['MPS', 'MPS'], selectMps: ['\u9009\u62e9 MPS ID', 'Select MPS ID'], version: ['\u7248\u672c', 'Version'],
  botDeployed: ['\u5df2\u90e8\u7f72', 'Deployed'], botInUse: ['\u8c03\u8bd5\u4e2d', 'In use'], botConflict: ['Bot \u5df2\u88ab\u90e8\u7f72\u6216\u6b63\u5728\u8c03\u8bd5', 'This Bot is already deployed or being used for debugging.'],
  deploy: ['\u90e8\u7f72', 'Deploy application'], retry: ['\u91cd\u8bd5\u90e8\u7f72', 'Retry deployment'],
  cancel: ['\u53d6\u6d88\u90e8\u7f72', 'Cancel deployment'], stop: ['\u505c\u6b62\u90e8\u7f72', 'Stop deployment'], status: ['\u5237\u65b0\u72b6\u6001', 'Refresh status'],
  idle: ['\u7a7a\u95f2', 'Idle'], deployed: ['\u5df2\u90e8\u7f72', 'Deployed'], deploying: ['\u90e8\u7f72\u4e2d', 'Deploying'], reserved: ['\u5df2\u9884\u7559', 'Reserved'],
  authCode: ['\u6388\u6743\u7801', 'Authorization code'], serverAccepted: ['\u670d\u52a1\u5668\u7533\u8bf7\u5df2\u901a\u8fc7\u3002', 'Server application accepted.']
};
function deployText(key){ const value=deploymentTextMap[key]; return value ? value[language.value==='en'?1:0] : key; }
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
  if(!response.ok) throw new Error(result.error?.message || result.error || t('请求失败'));
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
async function sendCode(){ await perform(async()=>{ await api('auth/code',account()); cooldown.value=60; notify(t('验证码已发送，请查看手机或邮箱。')); }); }
async function login(){ await perform(async()=>{ await api('auth/login',{...account(),code:fieldValue('code').trim()}); loginCode.value=''; notify(t('登录成功，正在更新我的冒泡。')); await refreshDevices(); }); }
async function logout(){ if(fileWorkspace.value && !fileWorkspace.value.canLeave()) return; await perform(async()=>{ await api('auth/logout',{}); launchRequested.value=false; loginPanelOpen.value=false; items.value=[]; after.value=0;  notify(t('已退出登录，本地调试环境已停止。')); }); }
async function refreshDevices(){ await api('devices/refresh',{}); lastRefresh=Date.now(); }
async function refresh(){ await perform(async()=>{ await refreshDevices(); notify(t('设备状态已更新。')); }); }

async function refreshBots(){ await perform(()=>api('bots/refresh',{})); }
async function saveBotToken({botId,token}){
  await perform(async()=>{ await api('bots/token',{botId,token}); notify(t('Bot token 已设置，本次 Studio 运行期间有效。')); });
}
async function selectBot(event){
  if(botOccupied(event.target.value,'')) { event.target.value=state.value?.runtimeConfig?.botId||''; notify(deployText('botConflict'),true); return; }
  await perform(()=>api('bots/select',{botId:event.target.value}));
  event.target.value=state.value?.runtimeConfig?.botId||'';
}
async function refreshSlots(){ await perform(()=>api('run/slots/refresh',{runId:state.value?.run?.runId})); }
async function bindSlot(selection){
  await perform(async()=>{
    const result=await api('run/slots/bind',{...selection,runId:state.value?.run?.runId});
    notify(result.error ? t('设备已关联，但状态刷新失败，请刷新槽位。') : t('设备已关联。'),Boolean(result.error));
  });
}
async function startRun(){
  launchRequested.value=true;
  await perform(async()=>{
    try{
      const automatic=autoRunMpy.value;
      const selectedBotId=state.value?.runtimeConfig?.botId||'';
      if(botOccupied(selectedBotId,'')) throw new Error(deployText('botConflict'));
      if(state.value?.run) notify(automatic?t('正在重启：先让设备进入 Python Dev，再自动上传并运行设备代码。'):t('正在重启：先让设备进入 Python Dev，再重新加载本地服务；设备代码等待冒泡 App 发起启动。'));
      await api('run/start',{bot:botEntry.value.trim(),autoRunMpy:automatic,botId:state.value?.runtimeConfig?.botId,botApiBaseUrl:botApi.value.trim()});

      notify(automatic?t('智能体本地服务已启动；识别到已绑定设备后将自动上传并运行 MPY。'):state.value?.project?.webRoot?t('智能体本地服务已启动，请在冒泡 App 中打开本轮新链接。'):t('智能体本地服务已启动，请在冒泡 App 中与 Bot 交互。'));
    }catch(error){
      launchRequested.value=false;
      throw error;
    }
  });
}
async function stopRun(){
  await perform(async()=>{
    notify(t('正在停止：等待设备重启应答，然后关闭本地服务。'));
    const result=await api('run/stop',{});
    launchRequested.value=false;
    const missing=(result.devices||[]).filter(device=>device.status!=='rebootAccepted');
    notify(missing.length
      ?t('本地已停止；设备停止未确认：')+missing.map(device=>device.deviceId+t('：')+serviceMessage(device.message)+t('。')).join(t('；'))
      :result.devices?.length?t('智能体已停止：设备已应答重启请求，本地服务已关闭，日志已保留。'):t('智能体本地服务已停止，本轮没有需要重启的设备。'),missing.length>0);
  });
}
async function changeWebAppAddress(event){
  const host=event.target.value;
  await perform(async()=>{
    await api('webapp/address',{host});
    notify(t('访问地址已保存，启动智能体后请让 Bot 发送新卡片。'));
  });
  event.target.value=state.value?.webAppHostname||'pixelmug-studio.local';
}
async function copyUrl(){ await perform(async()=>{ await navigator.clipboard.writeText(state.value?.run?.webAppUrl||''); notify(t('已复制 WebApp 链接，请在冒泡 App 中打开。')); }); }
async function runDevice(row){
  await perform(async()=>{
    await api(row.binding?'run/device':'run/rerun',row.binding?{bindingId:row.binding.bindingId}:{launchId:row.job.launchId});
    notify(t('正在更新设备代码，请查看设备进度和日志。'));
  });
}
async function runMpyAgain(device){
  await perform(async()=>{
    await api('run/mpy/again',{launchId:device.job.launchId});
    notify(t('正在从 __main__.py 再次运行 MPY；不会重启 Bot 或重新上传文件。'));
  });
}
async function refreshDeploymentServers(){
  deploymentBusy.value=true;
  try { const result=await api('deploy/servers'); deploymentServers.value=result.nodes||[]; if(selectedServerId.value&&!deploymentServers.value.some(server=>server.id===selectedServerId.value)) selectedServerId.value=null; }
  catch(error){ notify(error.message,true); }
  finally { deploymentBusy.value=false; }
}
async function applyDeploymentServer(){
  const authCode=window.prompt(deployText('authCode')); if(authCode===null) return;
  await perform(async()=>{ await api('deploy/apply',{auth_code:authCode}); await refreshDeploymentServers(); notify(deployText('serverAccepted')); });
}
function selectDeploymentServer(server){ selectedServerId.value=server.id; deploymentMpsId.value=server.deployment?.mps_id||''; const savedBotId=server.deployment?.deployment_id ? sessionStorage.getItem(`pixelmug-deploy-bot:${server.deployment.deployment_id}`) : ''; deploymentBotId.value=server.deployment?.bot_id||savedBotId||state.value?.runtimeConfig?.botId||''; deploymentProjectInfo.value=server.deployment ? { project_id:server.deployment.project_id, mps:{name:server.deployment.mps_name,version:server.deployment.mps_version} } : null; deploymentLog.value=[]; deploymentRemoteLogKeys.clear(); void syncDeploymentMetadata(server).catch(error=>deploymentLog.value.push(`Metadata update failed: ${error.message}`)); }
async function syncDeploymentMetadata(server){
  if(!server.deployment?.deployment_id || server.deployment.bot_id || server.deployment.mps_name) return;
  const info=await api('deploy/project-info').catch(()=>null);
  if(!info || info.project_id!==server.deployment.project_id) return;
  const botId=deploymentBotId.value, bot=(state.value?.bots||[]).find(item=>item.id===botId);
  const updated=await api('deploy/metadata/'+server.deployment.deployment_id,{bot_id:botId,bot_name:bot?.name||'',mps_id:server.deployment.mps_id||deploymentMpsId.value,mps_name:info.mps?.name||'',mps_version:server.deployment.mps_version||info.mps?.version||''});
  updateDeploymentSnapshot(updated);
  deploymentProjectInfo.value=info;
}
function backToDeploymentServers(){ selectedServerId.value=null; deploymentProjectInfo.value=null; deploymentMpsId.value=''; deploymentBotId.value=''; deploymentLog.value=[]; deploymentRemoteLogKeys.clear(); }
function deploymentStatusLabel(status){ return deployText(status==='deployed'?'deployed':status==='deploying'?'deploying':status==='reserved'?'reserved':'idle'); }
function appendDeploymentLogs(deployment){
  for(const entry of deployment?.logs||[]){
    const key=`${entry.at}|${entry.message}`;
    if(deploymentRemoteLogKeys.has(key)) continue;
    deploymentRemoteLogKeys.add(key);
    deploymentLog.value.push(`[deploy] ${entry.message}`);
  }
}
function updateDeploymentSnapshot(deployment){
  if(!deployment?.deployment_id) return;
  deploymentServers.value=deploymentServers.value.map(server=>server.deployment?.deployment_id===deployment.deployment_id
    ? {...server, status:deployment.status, deployment:{...server.deployment,...deployment}}
    : server);
}
async function loadCurrentProjectForDeployment(){ if(!project.value) return notify(t('请先打开一个项目，再加载到服务器。'),true); await perform(async()=>{ deploymentProjectInfo.value=await api('deploy/project-info'); deploymentBotId.value=state.value?.runtimeConfig?.botId||''; deploymentMpsId.value=''; deploymentLog.value.push(`${t('当前项目')}: ${deploymentProjectInfo.value.project_id}`); notify(t('当前项目已加载，请检查 Bot 和 MPS 信息后再部署。')); }); }
async function uploadDeployment(deployment){
   deploymentLog.value.push(t('正在打包并上传发布版本'));
   const pollLogs=async()=>{ try{ const latest=await api('deploy/status/'+deployment.deployment_id); updateDeploymentSnapshot(latest); appendDeploymentLogs(latest); }catch{} };
   const timer=setInterval(pollLogs,1500);
   try{
     const response=await fetch('/api/deploy/upload',{method:'POST',headers:{Authorization:'Bearer '+credential,'X-Deployment-Id':deployment.deployment_id,'X-Release-Id':'1.0.0','X-Mps-Id':deploymentMpsId.value.trim(),'X-Bot-Id':deploymentBotId.value}});
     const result=await response.json(); updateDeploymentSnapshot(result); appendDeploymentLogs(result);
     if(!response.ok) throw new Error(`Studio ${response.status} /api/deploy/upload: ${result.error||t('发布版本上传失败')}`);
     deploymentLog.value.push(t('发布版本已上传，容器正在运行'));
   } finally { clearInterval(timer); }
}
async function createCloudDeployment(){
  let server;
  try {
  if(botOccupied(deploymentBotId.value,'')) throw new Error(deployText('botConflict'));
  server=deploymentServers.value.find(item=>item.id===selectedServerId.value); if(!server) throw new Error(t('请先选择服务器'));
  if(!deploymentProjectInfo.value) throw new Error(t('请先加载项目'));
  if(!deploymentMpsId.value.trim()) throw new Error(t('请输入 MPS ID'));
  if(!deploymentBotId.value) throw new Error(t('部署前请选择 Bot'));
  } catch(error) {
    deploymentLog.value.push(error.message || String(error));
    notify(error.message || String(error), true);
    return;
  }
  await perform(async()=>{
    await api('bots/select',{botId:deploymentBotId.value});
    const created=await api('deploy/create',{nodeId:server.id,mpsId:deploymentMpsId.value.trim(),botId:deploymentBotId.value});
    sessionStorage.setItem(`pixelmug-deploy-bot:${created.deployment_id}`,deploymentBotId.value);
    deploymentLog.value.push(t('部署已预留：{0}',[created.deployment_id]));
    await refreshDeploymentServers();
    try {
      await uploadDeployment(created);
      await refreshDeploymentServers();
      notify(t('部署正在运行。'));
    } catch(error) {
      deploymentLog.value.push(t('部署失败，正在释放服务器'));
      try { await api('deploy/stop/'+created.deployment_id,{}); deploymentLog.value.push(t('部署预留已释放')); } catch(cleanupError) { deploymentLog.value.push(t('无法释放部署：{0}',[cleanupError.message])); }
      await refreshDeploymentServers();
      throw error;
    }
  });
}
async function uploadCloudRelease(){
  const server=deploymentServers.value.find(item=>item.id===selectedServerId.value), deployment=server?.deployment; if(!deployment) throw new Error(t('请先创建部署'));
 await perform(async()=>{
   deploymentLog.value.push(t('正在打包并上传发布版本'));
   const pollLogs=async()=>{ try{ const latest=await api('deploy/status/'+deployment.deployment_id); appendDeploymentLogs(latest); }catch{} };
   const timer=setInterval(pollLogs,1500);
   try{
     const response=await fetch('/api/deploy/upload',{method:'POST',headers:{Authorization:'Bearer '+credential,'X-Deployment-Id':deployment.deployment_id,'X-Release-Id':'1.0.0','X-Mps-Id':deploymentMpsId.value.trim()}});
     const result=await response.json(); appendDeploymentLogs(result);
     if(!response.ok) throw new Error(`Studio ${response.status} /api/deploy/upload: ${result.error||t('发布版本上传失败')}`);
     deploymentLog.value.push(t('发布版本已上传，容器正在运行')); await refreshDeploymentServers(); notify(t('部署正在运行。'));
   } finally { clearInterval(timer); }
 });
}
async function queryCloudDeployment(){ const server=deploymentServers.value.find(item=>item.id===selectedServerId.value); if(!server?.deployment) return; await perform(async()=>{ const result=await api('deploy/status/'+server.deployment.deployment_id); appendDeploymentLogs(result); deploymentLog.value.push(t('状态已查询：{0}',[result.status])); await refreshDeploymentServers(); }); }
async function stopCloudDeployment(){ const server=deploymentServers.value.find(item=>item.id===selectedServerId.value); if(!server?.deployment) return; await perform(async()=>{ await api('deploy/stop/'+server.deployment.deployment_id,{}); deploymentLog.value.push(t('部署已停止')); await refreshDeploymentServers(); }); }
async function retryCloudDeployment(){ const server=deploymentServers.value.find(item=>item.id===selectedServerId.value); if(!server?.deployment || server.deployment.status!=='unhealthy') return; await perform(async()=>{ const reset=await api('deploy/retry/'+server.deployment.deployment_id,{}); updateDeploymentSnapshot(reset); deploymentLog.value.push(t('正在重试部署')); await uploadDeployment(reset); }); }

const project = computed(()=>state.value?.project);
const selectedDeploymentServer = computed(()=>deploymentServers.value.find(server=>server.id===selectedServerId.value)||null);
const active = computed(()=>Boolean(state.value?.run));
function deploymentForBot(botId){
  return deploymentServers.value.map(server=>server.deployment).find(deployment =>
    deployment?.bot_id===botId && ['reserved','deploying','deployed','cleaning','unhealthy'].includes(deployment.status));
}
function botOccupied(botId, allowDeploymentId=''){
  return Boolean(botOccupation(botId, allowDeploymentId));
}
function botOccupation(botId, allowDeploymentId=''){
  if(!botId) return '';
  if(active.value && state.value?.runtimeConfig?.botId===botId) return 'botInUse';
  const deployment=deploymentForBot(botId);
  return deployment && deployment.deployment_id!==allowDeploymentId ? 'botDeployed' : '';
}
const deployedBotIds = computed(()=>deploymentServers.value.map(server=>server.deployment).filter(deployment=>deployment && ['reserved','deploying','deployed','cleaning','unhealthy'].includes(deployment.status) && deployment.bot_id).map(deployment=>deployment.bot_id));
const projectName = computed(()=>project.value?.path?.split(/[\\/]/).filter(Boolean).pop() || '');
const latestJobs = computed(()=>[...(state.value?.events?.launches||[])].reverse());
const deploymentSteps=['进入开发模式','连接设备','上传设备代码','应用开始运行'];
function deploymentIndexFor(job){ const value=job?.state; if(!value) return -1; if(['accepted','rebooting'].includes(value)) return 0; if(value==='connecting') return 1; if(['uploading','uploaded'].includes(value)) return 2; if(['rerunning','running','completed'].includes(value)) return 3; return -1; }
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
const labels={accepted:'准备代码',rebooting:'重启设备',connecting:'连接设备',uploading:'上传文件',uploaded:'上传完成',rerunning:'正在再次运行 MPY',running:'设备应用已启动',failed:'失败',completed:'执行结束',stopped:'已中止',unknown:'状态未知',superseded:'已被新任务替代'};
const deviceProcessStatus=job=>{
  if(!project.value?.mpy) return t('可以运行，无需加载代码');
  if(!job) return t('已绑定，等待运行');
  if(['accepted','rebooting'].includes(job.state)) return t('进入开发模式');
  if(job.state==='connecting') return t('连接设备');
  if(['uploading','uploaded'].includes(job.state)) return t('上传设备代码');
  if(job.state==='running') return t('应用开始运行');
  return t(labels[job.state]||job.state);
};
const debugDevices=computed(()=>{
  const seen=new Set(), result=[];
  for(const binding of bindings.value){
    const device=binding.device||{}, id=device.deviceId;
    if(!id||seen.has(id)) continue;
    seen.add(id);
    const accountDevice=(state.value?.devices||[]).find(item=>item.id===id)||{};
    const job=latestJobs.value.find(item=>item.device?.deviceId===id);
    result.push({id,name:device.name||accountDevice.name||device.sn||accountDevice.sn||'PixelMug',sn:device.sn||accountDevice.sn||'',avatar:accountDevice.avatar||device.avatar||'',talId:accountDevice.talId||device.talId||'',status:deviceProcessStatus(job),canRunMpyAgain:Boolean(project.value?.mpy&&job?.canRunMpyAgain),binding,job});
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
const topologyWebAddress=computed(()=>state.value?.run?.webAppUrl?new URL(state.value.run.webAppUrl).origin:`http://${state.value?.webAppHostname||'pixelmug-studio.local'}:${state.value?.webAppPort||7979}`);
watch([active,debugDevices],([running,devices])=>{
  if(activeSection.value.startsWith('device:')&&(!running||!devices.some(device=>device.id===selectedDeviceId.value))) activeSection.value='debug';
});
watch(activeSection, value=>{ if(value==='deploy') void refreshDeploymentServers(); });
watch(()=>state.value?.user, value=>{ if(value) void refreshDeploymentServers(); });
watch(deploymentLog, async()=>{ await nextTick(); if(deploymentLogElement.value) deploymentLogElement.value.scrollTop=deploymentLogElement.value.scrollHeight; }, { deep:true });
function networkText(network){
  if(!network) return t('Wi-Fi / IP：待获取（运行设备时查询）');
  return t('Wi-Fi：{0} · IP：{1}', [network.ssid||t('名称未获取'), network.ip||t('未获取')])+
    (network.wifiConnected===false?t(' · Wi-Fi 未连接'):'')+
    t(' · 最近获取 {0}', [new Date(network.updatedAt).toLocaleTimeString()]);
}
function rowDevice(row){ return row.binding?.device || row.job?.device; }
function rowState(row){ return row.plan?.state || row.job?.state || 'bound'; }
function rowTitle(row){ return row.plan ? (row.plan.state==='failed'?t('智能体重启未完成'):t('等待恢复设备运行')) : row.job ? labels[row.job.state]||row.job.state : t('已绑定，尚未运行'); }
function rowDisabled(row){
  if(row.plan) return true;
  return working.value || !project.value?.mpy || !botAlive.value ||
    (row.binding ? !row.binding.available : row.job?.canRerun===false) ||
    Boolean(row.job && !['running','failed','completed','stopped','unknown'].includes(row.job.state));
}
const configurationErrors = computed(()=>{
  if(!project.value) return [];
  const errors=[];
  if(!botEntry.value.trim()) errors.push(t('尚未指定冒泡 Bot 入口文件。'));
  const selectedBot = state.value?.bots?.find(bot=>bot.id===state.value?.runtimeConfig?.botId);
  if(!selectedBot) errors.push(t('请在运行配置中选择 Bot。'));
  else if(!selectedBot.hasToken) errors.push(t('请先在“我的冒泡”中设置所选 Bot 的 token。'));
  return errors;
});
const readyDescription = computed(()=>{
  const messages=[t('Studio 将启动运行 bot')];
  if(project.value?.webRoot) messages.push(t('为 webapp 提供访问地址'));
  if(project.value?.mpy) messages.push(autoRunMpy.value?t('Studio 将自动为设备加载代码并运行'):t('Studio 不会自动为设备加载代码，请使用智能体本身加载和运行设备代码'));
  return messages.join(t('，'))+t('。');
});
const runStatusDescription=computed(()=>{
  const messages=[botAlive.value?t('bot已经启动运行'):t('bot正在启动')];
  if(project.value?.webRoot) messages.push(state.value?.run?.webAppUrl?t('Webapp服务已经启动'):t('Webapp服务正在启动'));
  if(project.value?.mpy){
    const running=jobs.value.some(job=>job.state==='running');
    const loading=jobs.value.some(job=>['accepted','rebooting','connecting','uploading','uploaded'].includes(job.state));
    const failed=jobs.value.some(job=>job.state==='failed');
    if(running) messages.push(t('设备代码已经运行'));
    else if(loading) messages.push(t('设备代码正在加载'));
    else if(failed) messages.push(t('设备代码运行失败，请查看对应设备日志'));
    else if((launchRequested.value?autoRunMpy.value:state.value?.runtimeConfig?.autoRunMpy===true)) messages.push(bindings.value.length?t('Studio正在为设备加载代码'):t('正在等待获取已绑定设备'));
  }
  return messages.join(t('，'))+t('。');
});
const runStarted=computed(()=>active.value||launchRequested.value);
const guideLinksToProject = computed(()=>!project.value||(!runStarted.value&&configurationErrors.value.length>0));
const guide = computed(()=>{
  const errors=[];
  if(!project.value) return {stage:0,title:t('请选择加载运行的应用'),body:t('选择本机保存的项目目录，加载运行'),errors};
  if(!runStarted.value){
    if(configurationErrors.value.length) return {stage:1,title:t('请重新检查智能体应用'),body:t('以下配置不符合运行条件：'),errors:configurationErrors.value};
    return {stage:1,title:t('可以启动智能体'),body:readyDescription.value,errors};
  }
  return {stage:3,title:t('智能体已启动，开始使用和测试吧'),body:runStatusDescription.value,errors};
});
const operationHint = computed(()=>active.value
  ? state.value?.runtimeConfig?.autoRunMpy?t('重启会让本轮设备进入 Python Dev，并自动上传、运行 MPY。停止会请求设备普通重启。'):t('重启会让本轮设备进入 Python Dev 并重新加载本地服务；MPY 等待冒泡 App 发起启动后上传。停止会请求设备普通重启。')
  : project.value?t('启动本地 Bot 与可选 WebApp 服务，再到冒泡 App 中体验。'):t('先打开本地项目，再启动智能体。'));
const startDisabled=computed(()=>working.value||!project.value||!state.value?.user||configurationErrors.value.length>0||active.value);
const restartDisabled=computed(()=>working.value||!active.value);
const projectComposition=computed(()=>project.value?t('应用组成：')+['bot',...(project.value.webRoot?['WebApp']:[]),...(project.value.mpy?['MPY']:[])].join(' + '):'');

async function browse(path){
  const data=await api('directories'+(path?'?path='+encodeURIComponent(path):''));
  directory.value=data;
}
async function openDirectory(){ await perform(async()=>{ await browse(project.value?.path); directoryDialog.value.showModal(); }); }
async function browseAction(path){ await perform(()=>browse(path)); }
async function chooseDirectory(){ if(fileWorkspace.value && !fileWorkspace.value.canLeave()) return; await perform(async()=>{ await api('project/open',{path:directory.value.path}); activeSection.value='debug'; directoryDialog.value.close(); notify(t('项目已打开，请检查运行入口与 bot 配置。')); }); }

function applyState(data){
  const previousPath=state.value?.project?.path;
  state.value=data;
  if(data.run) launchRequested.value=false;
  if(!initialized) creatorUrl.value=data.creatorUrl;
  if(!initialized || previousPath!==data.project?.path){
    botEntry.value=data.project?.bot||'';
    autoRunMpy.value=Boolean(
      data.project?.mpy && (!data.run || data.runtimeConfig?.autoRunMpy === true),
    );
    botApi.value=data.runtimeConfig?.botApiBaseUrl||'';
  }
  if(data.events){
    if(runId.value!==data.events.runId){ runId.value=data.events.runId; items.value=[]; after.value=0; }
    items.value=items.value.concat(data.events.records).slice(-1000);
    after.value=data.events.cursor;
    if(data.events.truncated) notify(t('部分较早日志已超出显示窗口，完整记录仍在 debug/ 目录中。'));
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
  if(!credential) notify(t('请使用启动终端提供的完整 Studio 地址打开页面。'),true);
  await pollOnce();
  pollTimer=setInterval(async()=>{ await pollOnce(); if(state.value?.user&&!working.value&&Date.now()-lastRefresh>15000){ lastRefresh=Date.now(); try{ await refreshDevices(); }catch(error){ notify(error.message,true); } } },1000);
  cooldownTimer=setInterval(()=>{ if(cooldown.value>0) cooldown.value--; },1000);
});
onBeforeUnmount(()=>{ clearInterval(pollTimer); clearInterval(cooldownTimer); clearTimeout(noticeTimer); });
</script>

<template>
  <div :class="{'studio-shell': state?.user}">
  <header class="app-header" :hidden="!state?.user">
    <div class="brand"><span class="mark"><img :src="deviceIcon" alt="PixelMug"></span><div>PixelMug <b>Studio</b><small>DEVELOPER WORKSPACE</small></div></div>
    <div class="header-right"><LanguageSwitcher /><span id="user-name">{{ state?.user?.name || '' }}</span><button id="logout" :hidden="!state?.user" :disabled="working" @click="logout">{{ t('退出登录') }}</button></div>
  </header>
  <div id="notice" role="status" aria-live="polite" :hidden="!notice.visible" :class="{error:notice.error}">{{ serviceMessage(notice.message) }}</div>

  <section id="login-view" class="login-shell" :hidden="Boolean(state?.user)" :style="{backgroundImage:`url(${indexBackground})`}">
    <LanguageSwitcher id="login-language" class="login-language" />
    <div v-if="!loginPanelOpen" class="login-hero">
      <p class="login-slogan">{{ t('让每一个灵感 在 PixelMug 上运行') }}</p>
      <h1>{{ t('如果你的下一台电脑，') }}<br>{{ t('是一个杯子呢？') }}</h1>
      <button type="button" class="bubble-login-button" @click="loginPanelOpen=true">{{ t('用冒泡账号登录') }}</button>
    </div>
    <form v-else id="login-form" class="login-panel" @submit.prevent="login">
      <span class="eyebrow">{{ t('冒泡账号') }}</span>
      <h2>{{ t('登录 PixelMug Studio') }}</h2>
      <p class="login-description">{{ t('登录后自动获取你的设备和 Bot。') }}</p>
      <label>{{ t('账号类型') }}<select id="account-type" v-model="accountType"><option value="PHONE">{{ t('手机号') }}</option><option value="EMAIL">{{ t('邮箱') }}</option></select></label>
      <label>{{ t('手机号 / 邮箱') }}<input id="account" v-model="accountValue" autocomplete="username" required :placeholder="t('输入冒泡账号')"></label>
      <label>{{ t('登录验证码') }}<div class="inline"><input id="code" v-model="loginCode" autocomplete="one-time-code" required :placeholder="t('输入验证码')"><button id="send-code" type="button" :disabled="working||cooldown>0" @click="sendCode">{{ cooldown>0 ? cooldown+t('s 后重试') : t('获取验证码') }}</button></div></label>
      <input id="creator-url" v-model="creatorUrl" type="hidden">
      <button class="primary wide" id="login" type="submit" :disabled="working">{{ t('登录 Studio →') }}</button>
    </form>
  </section>

  <main id="workspace" :hidden="!state?.user">
    <StageNavigation :active-tab="activeSection" :active="active" :busy="working||state?.busy" :device-count="state?.devices?.length||0" :bot-count="state?.bots?.length||0" :debug-devices="debugDevices" :deployment-servers="deploymentServers" :service-status="serviceStatus" @change="activeSection=$event" @rerun-mpy="runMpyAgain"><template #files><FileWorkspace v-if="project && state?.user" ref="fileWorkspace" :key="project.path" :project="project.path" :style-nonce="credential" :active="activeSection==='files'" :api="api" @activate="activeSection='files'" /></template></StageNavigation>
    <section class="workspace-content">
      <div class="workspace-heading">
        <div><span class="eyebrow">{{ t('冒泡智能体 · 开发工作台') }}</span><h1 v-if="projectName" id="project-name">{{ projectName }}</h1></div>
        <span id="run-status" class="badge">{{ active ? t('本地服务已启动') : t('尚未启动') }}</span>
      </div>

      <DocumentationPanel v-if="activeSection==='docs' && state?.docsUrl" :url="state.docsUrl" />
      <div id="file-editor-host"></div>
      <section v-show="activeSection==='devices'" class="section-page devices-page">
        <div class="section-intro"><div><span class="eyebrow">MY DEVICES</span><h2>{{ t('我的设备') }}</h2><p>{{ t('查看当前冒泡账号绑定的全部 PixelMug 及在线状态。') }}</p></div><button id="refresh-devices" :disabled="working" @click="refresh">{{ t('刷新设备') }}</button></div>
        <DevicePanel class="devices-full" :devices="state?.devices||[]" :latest-jobs="latestJobs" :bindings="bindings" :active="active">
          <template #updated><p id="device-updated" class="subtle">{{ state?.devicesUpdatedAt ? t('状态更新时间： ')+new Date(state.devicesUpdatedAt).toLocaleTimeString() : t('状态更新时间：尚未获取') }}</p></template>
        </DevicePanel>
        <BotPanel v-if="state?.user" :key="state.user.id" :bots="state?.bots||[]" :error="state?.botsError" :busy="working||state?.busy" :running-bot-id="active ? state?.runtimeConfig?.botId : ''" :deployed-bot-ids="deployedBotIds" @refresh="refreshBots" @save="saveBotToken" />
      </section>

       <section v-show="activeSection==='deploy'" class="section-page deploy-page">
         <div class="section-intro deployment-section-intro-v2"><div><span class="eyebrow">{{ deployText('deployApplication') }}</span><h2 class="servers-page-title" :class="{clickable:Boolean(selectedDeploymentServer)}" @click="selectedDeploymentServer&&backToDeploymentServers()">{{ deployText('cloudServers') }}</h2><p>{{ deployText('description') }}</p></div><div class="actions"><button :disabled="deploymentBusy||working" @click="refreshDeploymentServers">{{ deployText('refresh') }}</button><button class="primary" :disabled="deploymentBusy||working" @click="applyDeploymentServer">{{ deployText('applyServer') }}</button></div></div>
         <div class="section-intro"><div><span class="eyebrow">{{ t('部署应用') }}</span><h2 class="servers-page-title" :class="{clickable:Boolean(selectedDeploymentServer)}" @click="selectedDeploymentServer&&backToDeploymentServers()">{{ t('云服务器') }}</h2><p>{{ t('将当前在 Studio 中打开的项目部署到云服务器。') }}</p></div><div class="actions"><button :disabled="deploymentBusy||working" @click="refreshDeploymentServers">{{ t('刷新') }}</button><button class="primary" :disabled="deploymentBusy||working" @click="applyDeploymentServer">{{ t('申请服务器') }}</button></div></div>
         <div class="deployment-redesign">
           <div v-if="selectedDeploymentServer?.deployment" class="deployment-id-strip"><span>Deployment ID</span>: <strong>{{ selectedDeploymentServer.deployment.deployment_id }}</strong></div>
           <div v-if="!selectedDeploymentServer" class="server-card-grid"><button v-for="server in deploymentServers" :key="server.id" type="button" class="server-card" :class="{selected:selectedServerId===server.id}" @click="selectDeploymentServer(server)"><span class="server-cloud-art"><img :src="cloudServerIcon" alt=""></span><span class="server-card-main"><strong>{{ server.id }}</strong><span class="server-state"><i :class="server.deployment?.status || server.status"></i>{{ deploymentStatusLabel(server.deployment?.status || server.status) }}</span><span v-if="server.deployment" class="server-card-summary"><small>Project: {{ server.deployment.project_id }}</small><small>Deploy ID: {{ server.deployment.deployment_id }}</small><small>Bot: {{ server.deployment.bot_name || '—' }}</small><small>MPS: {{ server.deployment.mps_name || '—' }} · {{ server.deployment.mps_version || '—' }} · {{ server.deployment.mps_id || '—' }}</small></span></span><span class="server-validity">Validity remaining: —</span></button><p v-if="!deploymentServers.length" class="empty">No server is connected.</p></div>
           <section v-else class="card deployment-management"><div class="section-heading"><div><span class="eyebrow">DEPLOYMENT MANAGEMENT</span><h2>{{ selectedDeploymentServer.id }}</h2></div><span class="badge">{{ deploymentStatusLabel(selectedDeploymentServer.deployment?.status || selectedDeploymentServer.status) }}</span></div><div class="deployment-info-grid"><div><h3>Current project</h3><p><span>Project</span><strong>{{ deploymentProjectInfo?.project_id || selectedDeploymentServer.deployment?.project_id || 'Not loaded' }}</strong></p><p><span>Bot</span><strong>{{ deploymentProjectInfo ? ((state?.bots||[]).find(bot=>bot.id===deploymentBotId)?.name || 'Not selected') : (selectedDeploymentServer.deployment?.bot_name || 'Not loaded') }}</strong></p></div><div><h3>MPS</h3><p><span>Name</span><strong>{{ deploymentProjectInfo?.mps?.name || selectedDeploymentServer.deployment?.mps_name || 'Not loaded' }}</strong></p><p><span>Version</span><strong>{{ deploymentProjectInfo?.mps?.version || selectedDeploymentServer.deployment?.mps_version || '—' }}</strong></p><p><span>ID</span><strong>{{ selectedDeploymentServer.deployment?.mps_id || deploymentMpsId || 'Select MPS ID' }}</strong></p></div></div><div class="deployment-form-row"><label>Bot<select v-model="deploymentBotId" :disabled="Boolean(selectedDeploymentServer.deployment)||working"><option value="">Select a Bot</option><option v-for="bot in state?.bots||[]" :key="bot.key||bot.id" :value="bot.id">{{ bot.name||'Unnamed Bot' }}</option></select></label><label>MPS<select v-model="deploymentMpsId" :disabled="Boolean(selectedDeploymentServer.deployment)||working"><option value="">Select MPS ID</option><option v-for="mps in state?.mps||[]" :key="mps.appId" :value="mps.appId">{{ mps.appName || 'Unnamed MPS' }} · {{ mps.appId }}</option></select></label></div><div class="actions"><button :disabled="deploymentBusy||working||Boolean(selectedDeploymentServer.deployment)" @click="loadCurrentProjectForDeployment">Load current project information</button><button class="primary" :disabled="deploymentBusy||working||!deploymentProjectInfo||!deploymentMpsId.trim()||Boolean(selectedDeploymentServer.deployment)" @click="createCloudDeployment">Deploy application</button><button v-if="selectedDeploymentServer.deployment?.status==='deployed'" class="danger" :disabled="deploymentBusy||working" @click="stopCloudDeployment">Stop deployment</button><button v-if="['deployed','unhealthy'].includes(selectedDeploymentServer.deployment?.status)" :disabled="deploymentBusy||working" @click="queryCloudDeployment">Refresh status</button></div><pre v-if="deploymentLog.length" ref="deploymentLogElement" class="deployment-log">{{ deploymentLog.join('\n') }}</pre></section>
           <section v-if="selectedDeploymentServer" class="card deployment-management-v2">
             <div class="section-heading"><div><span class="eyebrow">{{ t('部署管理') }}</span><h2>{{ selectedDeploymentServer.id }}</h2></div><span class="badge">{{ deploymentStatusLabel(selectedDeploymentServer.deployment?.status || selectedDeploymentServer.status) }}</span></div>
             <div class="deployment-columns">
               <div class="deployment-column"><h3>{{ t('当前项目') }}</h3><button class="load-project-button" :disabled="deploymentBusy||working||Boolean(selectedDeploymentServer.deployment)" @click="loadCurrentProjectForDeployment">{{ t('加载项目信息') }}</button><p><span>{{ t('项目') }}</span><strong>{{ deploymentProjectInfo?.project_id || selectedDeploymentServer.deployment?.project_id || t('未加载') }}</strong></p><p><span>{{ t('部署 ID') }}</span><strong>{{ selectedDeploymentServer.deployment?.deployment_id || t('未创建') }}</strong></p></div>
               <div class="deployment-column"><h3>{{ t('Bot') }}</h3><select v-model="deploymentBotId" :disabled="Boolean(selectedDeploymentServer.deployment)||working"><option value="">{{ t('选择 Bot') }}</option><option v-for="bot in state?.bots||[]" :key="bot.key||bot.id" :value="bot.id">{{ bot.name||t('未加载') }}</option></select><p><span>{{ t('名称') }}</span><strong>{{ (state?.bots||[]).find(bot=>bot.id===deploymentBotId)?.name || selectedDeploymentServer.deployment?.bot_name || t('未加载') }}</strong></p><p><span>{{ t('ID') }}</span><strong>{{ deploymentBotId || selectedDeploymentServer.deployment?.bot_id || t('未加载') }}</strong></p></div>
               <div class="deployment-column"><h3>{{ t('MPS') }}</h3><select v-model="deploymentMpsId" :disabled="Boolean(selectedDeploymentServer.deployment)||working"><option value="">{{ t('选择 MPS ID') }}</option><option v-for="mps in state?.mps||[]" :key="mps.appId" :value="mps.appId">{{ mps.appName || t('未加载') }} · {{ mps.appId }}</option></select><p><span>{{ t('名称') }}</span><strong>{{ deploymentProjectInfo?.mps?.name || selectedDeploymentServer.deployment?.mps_name || t('未加载') }}</strong></p><p><span>{{ t('版本') }}</span><strong>{{ deploymentProjectInfo?.mps?.version || selectedDeploymentServer.deployment?.mps_version || '—' }}</strong></p></div>
             </div>
             <div class="actions"><button class="primary" :disabled="deploymentBusy||working||!deploymentProjectInfo||!deploymentMpsId.trim()||Boolean(selectedDeploymentServer.deployment)" @click="createCloudDeployment">{{ t('部署') }}</button><button v-if="selectedDeploymentServer.deployment?.status==='unhealthy'" class="primary" :disabled="deploymentBusy||working" @click="retryCloudDeployment">{{ t('重试部署') }}</button><button v-if="selectedDeploymentServer.deployment?.status==='unhealthy'" class="danger" :disabled="deploymentBusy||working" @click="stopCloudDeployment">{{ t('取消部署') }}</button><button v-if="selectedDeploymentServer.deployment?.status==='deployed'" class="danger" :disabled="deploymentBusy||working" @click="stopCloudDeployment">{{ t('停止部署') }}</button><button v-if="['deployed','unhealthy'].includes(selectedDeploymentServer.deployment?.status)" :disabled="deploymentBusy||working" @click="queryCloudDeployment">{{ t('刷新状态') }}</button></div>
           </section>
           <section v-if="selectedDeploymentServer" class="card deployment-management-v3">
             <div class="section-heading"><div><span class="eyebrow">{{ deployText('management') }}</span><h2>{{ selectedDeploymentServer.id }}</h2></div><span class="badge">{{ deploymentStatusLabel(selectedDeploymentServer.deployment?.status || selectedDeploymentServer.status) }}</span></div>
             <div class="deployment-columns">
               <div class="deployment-column"><h3>{{ deployText('currentProject') }}</h3><button class="load-project-button" :disabled="deploymentBusy||working||Boolean(selectedDeploymentServer.deployment)" @click="loadCurrentProjectForDeployment">{{ deployText('loadProject') }}</button><p><span>{{ deployText('project') }}</span><strong>{{ deploymentProjectInfo?.project_id || selectedDeploymentServer.deployment?.project_id || deployText('notLoaded') }}</strong></p><p><span>{{ deployText('deploymentId') }}</span><strong>{{ selectedDeploymentServer.deployment?.deployment_id || deployText('notCreated') }}</strong></p></div>
               <div class="deployment-column"><h3>{{ deployText('bot') }}</h3><select v-model="deploymentBotId" :disabled="Boolean(selectedDeploymentServer.deployment)||working"><option value="">{{ deployText('selectBot') }}</option><option v-for="bot in state?.bots||[]" :key="bot.key||bot.id" :value="bot.id" :disabled="Boolean(botOccupation(bot.id, selectedDeploymentServer.deployment?.deployment_id || ''))">{{ bot.name||deployText('notLoaded') }}{{ botOccupation(bot.id, selectedDeploymentServer.deployment?.deployment_id || '') ? ' · '+deployText(botOccupation(bot.id, selectedDeploymentServer.deployment?.deployment_id || '')) : '' }}</option></select><p><span>{{ deployText('name') }}</span><strong>{{ (state?.bots||[]).find(bot=>bot.id===deploymentBotId)?.name || selectedDeploymentServer.deployment?.bot_name || deployText('notLoaded') }}</strong></p><p><span>{{ deployText('id') }}</span><strong>{{ deploymentBotId || selectedDeploymentServer.deployment?.bot_id || deployText('notLoaded') }}</strong></p></div>
               <div class="deployment-column"><h3>{{ deployText('mps') }}</h3><select v-model="deploymentMpsId" :disabled="Boolean(selectedDeploymentServer.deployment)||working"><option value="">{{ deployText('selectMps') }}</option><option v-for="mps in state?.mps||[]" :key="mps.appId" :value="mps.appId">{{ mps.appName || deployText('notLoaded') }} · {{ mps.appId }}</option></select><p><span>{{ deployText('name') }}</span><strong>{{ deploymentProjectInfo?.mps?.name || selectedDeploymentServer.deployment?.mps_name || deployText('notLoaded') }}</strong></p><p><span>{{ deployText('version') }}</span><strong>{{ deploymentProjectInfo?.mps?.version || selectedDeploymentServer.deployment?.mps_version || '—' }}</strong></p></div>
             </div>
             <div class="actions"><button class="primary" :disabled="deploymentBusy||working||!deploymentProjectInfo||!deploymentMpsId.trim()||Boolean(selectedDeploymentServer.deployment)" @click="createCloudDeployment">{{ deployText('deploy') }}</button><button v-if="selectedDeploymentServer.deployment?.status==='unhealthy'" class="primary" :disabled="deploymentBusy||working" @click="retryCloudDeployment">{{ deployText('retry') }}</button><button v-if="selectedDeploymentServer.deployment?.status==='unhealthy'" class="danger" :disabled="deploymentBusy||working" @click="stopCloudDeployment">{{ deployText('cancel') }}</button><button v-if="selectedDeploymentServer.deployment?.status==='deployed'" class="danger" :disabled="deploymentBusy||working" @click="stopCloudDeployment">{{ deployText('stop') }}</button><button v-if="['deployed','unhealthy'].includes(selectedDeploymentServer.deployment?.status)" :disabled="deploymentBusy||working" @click="queryCloudDeployment">{{ deployText('status') }}</button></div>
           </section>
           <pre class="deployment-console">{{ deploymentLog.join('\n') }}</pre>
         </div>
        <div class="deployment-server-grid"><button v-for="server in deploymentServers" :key="server.id" type="button" class="deployment-server-card" :class="{selected:selectedServerId===server.id}" @click="selectDeploymentServer(server)"><span class="server-icon">▣</span><span><strong>{{ server.id }}</strong><small>{{ ['available','assigned'].includes(server.status)?'Idle':server.status }}</small><small v-if="server.deployment">{{ server.deployment.project_id }}</small><small v-if="server.deployment">MPY {{ server.deployment.mps_version }}</small><small v-if="server.deployment">MPS ID {{ server.deployment.mps_id }}</small><small v-else>No project deployed</small></span></button><p v-if="!deploymentServers.length" class="empty">No server is connected.</p></div>
        <section v-if="selectedDeploymentServer" class="card deployment-details"><div class="section-heading"><div><span class="eyebrow">SERVER DETAILS</span><h2>{{ selectedDeploymentServer.id }}</h2></div><span class="badge">{{ selectedDeploymentServer.status }}</span></div><div v-if="selectedDeploymentServer.deployment" class="deployment-project-summary"><strong>{{ selectedDeploymentServer.deployment.project_id }}</strong><span>MPY version {{ selectedDeploymentServer.deployment.mps_version }}</span><span>MPS ID {{ selectedDeploymentServer.deployment.mps_id }}</span><a v-if="selectedDeploymentServer.deployment.webapp_url" :href="selectedDeploymentServer.deployment.webapp_url" target="_blank">{{ selectedDeploymentServer.deployment.webapp_url }}</a></div><label>MPS ID<input v-model="deploymentMpsId" :disabled="Boolean(selectedDeploymentServer.deployment)" placeholder="Enter MPS ID"></label><div class="actions"><button :disabled="deploymentBusy||working||Boolean(selectedDeploymentServer.deployment)" @click="loadCurrentProjectForDeployment">Load current project</button><button class="primary" :disabled="deploymentBusy||working||!deploymentMpsId.trim()||Boolean(selectedDeploymentServer.deployment)" @click="createCloudDeployment">Create deployment</button><button :disabled="deploymentBusy||working||!selectedDeploymentServer.deployment" @click="uploadCloudRelease">Upload release</button><button :disabled="deploymentBusy||working||!selectedDeploymentServer.deployment" @click="queryCloudDeployment">Query status</button><button class="danger" :disabled="deploymentBusy||working||!selectedDeploymentServer.deployment" @click="stopCloudDeployment">Stop</button></div><pre v-if="deploymentLog.length" class="deployment-log">{{ deploymentLog.join('\n') }}</pre></section>
      </section>

      <section v-show="activeSection==='project'" class="section-page project-page">
        <div class="section-intro"><div><span class="eyebrow">PROJECT</span><h2>{{ t('智能体应用') }}</h2><p>{{ t('打开本地应用目录，确认冒泡Bot入口，配置运行参数') }}</p></div><button id="browse" class="primary" :disabled="working||active" @click="openDirectory">{{ t('打开应用目录') }}</button></div>
        <section class="card project-editor">
          <div class="project-summary">
            <div class="project-folder-icon"></div>
            <div><span class="eyebrow">{{ t('当前应用') }}</span><h2 v-if="projectName">{{ projectName }}</h2><p id="project-path" class="path muted">{{ project?.path || t('尚未打开应用') }}</p><p id="project-check" class="subtle">{{ projectComposition }}</p></div>
          </div>
          <div v-if="project" class="project-divider"></div>
          <details v-if="project" id="project-settings" open>
            <summary>{{ t('运行配置') }}</summary>
            <div class="settings-grid">
              <label>{{ t('Bot 入口') }}<input id="bot-entry" v-model="botEntry" placeholder="bot/index.js"><small>{{ t('必须是 bot/ 目录中的 .js、.mjs 或 .cjs 文件。') }}</small></label>
              <label>Bot<select id="bot-select" :value="state?.runtimeConfig?.botId||''" :disabled="working||state?.busy||active" @change="selectBot"><option value="" disabled>{{ t('请选择 Bot') }}</option><option v-for="bot in state?.bots||[]" :key="bot.key" :value="bot.id" :disabled="!bot.id">{{ bot.name||t('未命名 Bot') }}{{ bot.id ? ' · '+bot.id : t('（缺少 ID）') }}{{ bot.hasToken ? '' : t('（未设置 token）') }}</option></select><small>{{ t('在“我的冒泡”中设置 Bot token，本次 Studio 运行期间可重复使用。') }}</small><button type="button" class="bot-manage-link" @click="activeSection='devices'">{{ t('管理我的 Bot') }}</button></label>
              <label>{{ t('Bot API 地址（可选）') }}<input id="bot-api" v-model="botApi" :placeholder="t('使用 SDK 默认地址')"><small>{{ t('仅在连接自定义 Bot 服务时填写。') }}</small></label>
              <label v-if="project?.webRoot">{{ t('WebApp 访问地址') }}<select id="webapp-host" :value="state?.webAppHostname" :disabled="working||state?.busy||active" @change="changeWebAppAddress"><option v-if="!state?.webAppAddresses?.some(item=>item.host===state?.webAppHostname)" :value="state?.webAppHostname" disabled>{{ state?.webAppHostname }}{{ t('（已不可用）') }}</option><option v-for="item in state?.webAppAddresses||[]" :key="item.host" :value="item.host">{{ item.label }}</option></select><small>{{ t('默认使用 .local 解析；也可选择与手机同一局域网的 IP。运行中需先停止智能体才能修改，本次 Studio 会话内保留。') }}</small></label>
              <label v-if="project?.mpy" class="check-option auto-run-option"><input id="auto-run-mpy" v-model="autoRunMpy" type="checkbox" :disabled="working||active"><span><strong>{{ t('启动后自动运行设备代码') }}</strong><small>{{ t('开启后，运行智能体时，Studio 会自动加载并运行 PixelMug 端代码。') }}</small></span></label>
            </div>
          </details>
          <p class="project-requirements">{{ t('冒泡智能体应用至少应包含 bot/ 目录及智能体启动入口；还可包含 webapp/ 目录和 mpy/ 设备代码目录。包含设备代码时，请在 mpy/ 目录中使用 ') }}<code>__main__.py</code>{{ t(' 作为执行入口。') }}</p>
        </section>
      </section>

      <section v-if="activeSection==='debug'" class="section-page debug-page">
        <div class="section-intro debug-intro"><div><span class="eyebrow">DEBUG</span><h2>{{ t('调试运行') }}</h2><p>{{ t('启动智能体，在真实硬件上部署运行，观察运行日志') }}</p></div><div class="actions"><button id="start" class="primary" :disabled="startDisabled" @click="startRun">{{ working&&!active?t('请稍候…'):t('启动智能体') }}</button><button id="restart" :disabled="restartDisabled" @click="startRun">{{ t('重启智能体') }}</button><button id="stop" :disabled="restartDisabled" @click="stopRun">{{ t('停止智能体') }}</button></div></div>

        <section class="next-step" :class="{invalid:guide.errors?.length}" aria-live="polite"><span class="guide-icon"></span><div><span class="eyebrow">{{ t('当前状态') }}</span><h2 id="guide-title"><a v-if="guideLinksToProject" class="guide-title-link" href="#" @click.prevent="activeSection='project'">{{ guide.title }}</a><template v-else>{{ guide.title }}</template></h2><p id="guide-body">{{ guide.body }}</p><ul v-if="guide.errors?.length" class="configuration-errors"><li v-for="error in guide.errors" :key="error">{{ error }}</li></ul></div><p v-if="!runStarted&&!guide.errors?.length" id="operation-hint" class="operation-hint">{{ operationHint }}</p></section>

        <BotSlots v-if="active" :slots="state?.botSlots" :devices="state?.devices || []" :busy="working || state?.busy" @refresh="refreshSlots" @choose="perform(refreshDevices)" @bind="bindSlot" />

        <section v-if="project" class="card runtime-card">
          <div class="section-heading"><div><span class="eyebrow">RUNTIME</span><h2>{{ t('运行状态') }}</h2></div><span class="topology-status">{{ active?t('智能体运行中'):t('等待启动') }}</span></div>
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
            <div class="topology-node mug-node"><span class="topology-symbol mug-symbol"><img :src="deviceIcon" alt=""></span><strong>PixelMug</strong><div v-if="deviceCodeRunning" class="service-badges"><span class="service-badge">MPY</span><small>{{ t('代码安装成功') }}</small></div></div>
          </div>

          <details class="diagnostics"><summary>{{ t('连接与运行详情') }}</summary><div id="web-link-panel" :hidden="!state?.run?.webAppUrl"><label>{{ t('Studio为Webapp提供的局域网访问地址：') }}<div class="inline"><input id="web-url" :value="state?.run?.webAppUrl||''" readonly><button id="copy-url" @click="copyUrl">{{ t('复制链接') }}</button></div></label></div><p id="network-info" class="subtle">{{ t('请确保运行Studio的电脑、运行冒泡App的手机和PixelMug在同一个局域网') }}</p><p>{{ t('本轮运行 ') }}<span id="run-id" class="mono muted">{{ state?.run?.runId||'—' }}</span></p><p id="debug-dir" class="path subtle">{{ active?t('日志目录：')+state.run.debugDir:'' }}</p></details>
        </section>

        <LogWorkspace v-if="project" :items="items" :paused="paused" :source-ids="applicationLogSources" :title="t('应用运行日志')" :description="t('Bot 和 WebApp 输出持续保存到应用 debug/ 目录。')" @toggle-pause="paused=!paused" @clear="items=[]"/>
      </section>

      <section v-if="active&&selectedDevice" class="section-page device-debug-page">
        <section class="card device-overview-card">
          <div class="device-overview-image"><img v-if="selectedDeviceIcon.src" :class="selectedDeviceIcon.kind" :src="selectedDeviceIcon.src" :alt="selectedDeviceIcon.model"></div>
          <div class="device-overview-content">
            <span class="eyebrow">DEVICE</span>
            <h2>{{ selectedDevice.name }}</h2>
            <div class="device-facts">
              <div><span>Wi-Fi</span><strong>{{ selectedDeviceNetwork?.ssid||t('待获取') }}</strong></div>
              <div><span>{{ t('IP 地址') }}</span><strong>{{ selectedDeviceNetwork?.ip||t('待获取') }}</strong></div>
              <div><span>{{ t('最近获取时间') }}</span><strong>{{ selectedDeviceNetwork?.updatedAt?new Date(selectedDeviceNetwork.updatedAt).toLocaleTimeString():t('待获取') }}</strong></div>
              <div><span>{{ t('Bot 绑定位置') }}</span><strong>{{ t('槽位 ') }}{{ rowDevice(selectedDeviceRow).slot }}</strong></div>
            </div>
          </div>
          <details v-if="project?.mpy" class="device-actions"><summary>{{ t('设备高级操作') }}</summary><p class="subtle">{{ t('单独部署 MPY，不重启本地服务。设备将重启，旧应用及数据会被清除，保留引导配置。') }}</p><button :disabled="rowDisabled(selectedDeviceRow)" @click="runDevice(selectedDeviceRow)">{{ selectedDeviceRow.job?t('更新并运行设备代码'):t('上传并运行设备代码') }}</button></details>
        </section>

        <section v-if="project?.mpy" class="card process-card">
          <div class="section-heading"><div><span class="eyebrow">DEVICE PROCESS</span><h2>{{ t('设备运行过程') }}</h2></div><span class="process-state">{{ selectedDevice.status }}</span></div>
          <div class="deployment-track">
            <div v-for="(step,index) in deploymentSteps" :key="step" :class="['deployment-step',{done:selectedDeploymentIndex>index,current:selectedDeploymentIndex===index}]">
              <span>{{ selectedDeploymentIndex>index?'✓':index+1 }}</span><strong>{{ t(step) }}</strong><small>{{ selectedDeploymentIndex>index?t('已完成'):selectedDeploymentIndex===index?t('进行中'):t('等待') }}</small>
            </div>
          </div>
        </section>

        <LogWorkspace v-if="project?.mpy" :items="items" :paused="paused" :source-ids="['mpy']" :device-id="selectedDevice.id" :title="t('设备运行日志')" :description="selectedDevice.name+t(' 的 MPY 输出持续保存到应用 debug/ 目录。')" @toggle-pause="paused=!paused" @clear="items=[]"/>
      </section>
    </section>
  </main>
  <dialog id="directory-dialog" ref="directoryDialog"><div class="section-heading"><h2>{{ t('打开本地项目') }}</h2><button id="close-directory" :aria-label="t('关闭目录浏览器')" @click="directoryDialog.close()">×</button></div><div class="inline"><input id="directory-path" :value="directory?.path||''" @input="directory={...directory,path:$event.target.value}" @keydown.enter.prevent="browseAction(directory?.path)"><button id="directory-go" @click="browseAction(directory?.path)">{{ t('转到') }}</button><button id="directory-up" @click="browseAction(directory?.parent)">{{ t('上一级') }}</button></div><div id="drives" class="actions"><button v-for="drive in directory?.drives||[]" :key="drive" @click="browseAction(drive)">{{ drive }}</button></div><div id="directories"><button v-for="item in directory?.directories||[]" :key="item.path" @click="browseAction(item.path)">▸　{{ item.name }}</button><p v-if="directory&&!directory.directories.length" class="empty">{{ t('此目录没有可浏览的子目录。') }}</p></div><div class="dialog-footer"><button id="choose-directory" class="primary" @click="chooseDirectory">{{ t('使用当前目录') }}</button></div></dialog>
  </div>
</template>




