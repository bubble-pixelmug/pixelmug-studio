const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('studioToken') || sessionStorage.getItem('studio-workbench-token');
if (params.has('studioToken')) { sessionStorage.setItem('studio-workbench-token', token); params.delete('studioToken'); history.replaceState(null, '', location.pathname + location.search + (params.size ? '#' + params : '')); }
let state, after = 0, items = [], runId = null, paused = false, working = false, lastRefresh = 0, directory, cooldown = 0;
function notify(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').classList.toggle('error', error); }
async function api(path, body) {
  const response = await fetch('/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || result.error || '请求失败');
  return result;
}
async function action(fn) {
  if (working) return;
  working = true; updateButtons();
  try { await fn(); } catch (error) { notify(error.message, true); }
  finally { working = false; await pollOnce(); updateButtons(); }
}
function updateButtons() {
  $('start').disabled = working || !state?.project || !state?.user || !$('bot-entry').value.trim() || Boolean(state?.run);
  $('auto-run-mpy').disabled = working || !state?.project?.mpy || Boolean(state?.run);
  $('restart').disabled = working || !state?.run;
  $('start').textContent = working && !state?.run ? '请稍候…' : '启动智能体';
  $('stop').disabled = working || !state?.run;
  $('browse').disabled = working || Boolean(state?.run);
  $('login').disabled = working;
  $('send-code').disabled = working || cooldown > 0;
  $('send-code').textContent = cooldown > 0 ? `${cooldown}s 后重试` : '获取验证码';
  $('logout').disabled = working;
  $('refresh-devices').disabled = working;
}
function account() { return { baseUrl: $('creator-url').value.trim(), accountType: $('account-type').value, account: $('account').value.trim() }; }
$('send-code').onclick = () => action(async () => { await api('auth/code', account()); cooldown = 60; notify('验证码已发送，请查看手机或邮箱。'); });
$('login-form').onsubmit = event => { event.preventDefault(); void action(async () => { await api('auth/login', { ...account(), code: $('code').value.trim() }); $('code').value = ''; notify('登录成功，正在获取绑定设备。'); await refreshDevices(); }); };
$('logout').onclick = () => action(async () => { await api('auth/logout', {}); items = []; after = 0; $('bot-token').value = ''; renderLogs(); notify('已退出登录，本地调试环境已停止。'); });
async function refreshDevices() { await api('devices/refresh', {}); lastRefresh = Date.now(); }
$('refresh-devices').onclick = () => action(async () => { await refreshDevices(); notify('设备状态已更新。'); });
$('start').onclick = () => action(async () => {
  const autoRunMpy = $('auto-run-mpy').checked;
  if (state?.run) notify(autoRunMpy ? '正在重启：先让设备进入 Python Dev，再自动上传并运行设备代码…' : '正在重启：先让设备进入 Python Dev，再重新加载本地服务；设备代码等待冒泡 App 发起启动…');
  await api('run/start', { bot: $('bot-entry').value.trim(), autoRunMpy, botToken: $('bot-token').value, botApiBaseUrl: $('bot-api').value.trim() });
  $('bot-token').value = '';
  notify(autoRunMpy ? '智能体本地服务已启动；识别到已绑定设备后将自动上传并运行 MPY。' : state?.project?.webRoot ? '智能体本地服务已启动，请在冒泡 App 中打开本轮新链接。' : '智能体本地服务已启动，请在冒泡 App 中与 Bot 交互。');
});
$('restart').onclick = $('start').onclick;
$('stop').onclick = () => action(async () => {
  notify('正在停止：等待设备重启应答，然后关闭本地服务…');
  const result = await api('run/stop', {});
  const missing = (result.devices || []).filter(device => device.status !== 'rebootAccepted');
  notify(missing.length
    ? '本地已停止；设备停止未确认：' + missing.map(device => device.deviceId + '（' + device.message + '）').join('；')
    : result.devices?.length ? '智能体已停止：设备已应答重启请求，本地服务已关闭，日志已保留。' : '智能体本地服务已停止，本轮没有需要重启的设备。', missing.length > 0);
});
$('copy-url').onclick = () => action(async () => { await navigator.clipboard.writeText($('web-url').value); notify('已复制 WebApp 链接，请在冒泡 App 中打开。'); });
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '恢复滚动' : '暂停滚动'; };
$('clear').onclick = () => { items = []; renderLogs(); };
for (const id of ['source', 'level', 'search']) $(id).oninput = renderLogs;
$('bot-entry').oninput = updateButtons;
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function renderLogs() {
  const source = $('source').value, level = $('level').value, query = $('search').value.toLowerCase();
  const visible = items.filter(r => (!source || r.source === source) && (!level || r.level === level) && (!query || (r.message + ' ' + (r.deviceId || '')).toLowerCase().includes(query)));
  const scroll = $('logs').scrollTop;
  $('logs').replaceChildren(...visible.map(r => { const row = node('div', undefined, 'log ' + r.level); row.append(node('time', (r.timestamp || '').slice(11, 19)), node('span', r.source, 'source'), node('span', r.level), node('span', (r.deviceId ? '[' + r.deviceId + '] ' : '') + r.message, 'message')); return row; }));
  if (!visible.length) $('logs').append(node('p', items.length ? '没有匹配的日志。' : '等待应用输出日志…', 'empty'));
  $('log-count').textContent = String(items.length);
  $('logs').scrollTop = paused ? scroll : $('logs').scrollHeight;
}
function networkText(network) {
  if (!network) return 'Wi-Fi / IP：待获取（运行设备时查询）';
  return `Wi-Fi：${network.ssid || '名称未获取'} · IP：${network.ip || '未获取'}` +
    (network.wifiConnected === false ? ' · Wi-Fi 未连接' : '') +
    ` · 最近获取 ${new Date(network.updatedAt).toLocaleTimeString()}`;
}
const labels = { accepted: '准备代码', rebooting: '重启设备', connecting: '连接设备', uploading: '上传文件', uploaded: '上传完成', running: '设备应用已启动', failed: '失败', completed: '执行结束', stopped: '已中断', unknown: '状态未知', superseded: '已被新任务替代' };
function render(data) {
  const old = state;
  state = data;
  $('connection').textContent = '● 本地后台已连接';
  $('login-view').hidden = Boolean(data.user); $('workspace').hidden = !data.user;
  $('logout').hidden = !data.user; $('user-name').textContent = data.user?.name || '';
  if (!old) $('creator-url').value = data.creatorUrl;
  if (old?.project?.path !== data.project?.path || !old) {
    $('project-path').textContent = data.project?.path || '尚未打开项目';
    $('project-name').textContent = data.project?.path?.split(/[\\/]/).filter(Boolean).pop() || '让每一个灵感，在 PixelMug 上运行';
    $('project-settings').open = Boolean(data.project && !data.run);
    $('bot-entry').value = data.project?.bot || '';
    $('auto-run-mpy').checked = Boolean(data.project?.mpy && data.runtimeConfig?.autoRunMpy);
    $('bot-api').value = data.runtimeConfig?.botApiBaseUrl || '';

  }
  $('bot-token').placeholder = data.runtimeConfig?.hasBotToken ? '本地后台已保存，留空沿用' : '已设置环境变量时可留空';
  $('project-check').textContent = data.project ? '项目组成：' + ['bot', ...(data.project.webRoot ? ['WebApp'] : []), ...(data.project.mpy ? ['MPY'] : [])].join(' + ') : '';
  $('device-count').textContent = data.devices.length;
  $('device-updated').textContent = data.devicesUpdatedAt ? '更新于 ' + new Date(data.devicesUpdatedAt).toLocaleTimeString() : '尚未获取设备';
  const latestJobs = [...(data.events?.launches || [])].reverse();
  $('devices').replaceChildren(...data.devices.map(d => {
    const row = node('div', undefined, 'device'), top = node('div', undefined, 'device-top');
    top.append(node('strong', d.name), node('span', d.online === 'ONLINE' ? '● 在线' : '○ 离线'));
    row.append(top, node('div', d.id, 'meta')); if (d.sn) row.append(node('div', 'SN ' + d.sn, 'meta'));
    row.append(node('div', networkText(latestJobs.find(j => j.device.deviceId === d.id && j.network)?.network), 'meta')); return row;
  }));
  if (!data.devices.length) $('devices').append(node('p', '暂无设备，请在冒泡 App 绑定后刷新。', 'empty'));
  const active = data.run;
  $('network-info').textContent = 'WebApp 地址：http://' + (data.webAppHostname || 'pixelmug-studio.local') + ':' + (data.webAppPort || 7979) + ' · 请确保电脑、手机和 PixelMug 位于同一局域网。';  $('run-status').textContent = active ? '本地服务已启动' : '尚未启动';
  $('run-id').textContent = active?.runId || '—'; $('web-link-panel').hidden = !active?.webAppUrl;
  $('web-url').value = active?.webAppUrl || ''; $('web-status').textContent = active?.webAppUrl ? '服务已启动' : data.project?.webRoot ? '未启动' : '未启用';
  const bot = data.events?.bot;
  const alive = bot && bot.exitCode === null && !bot.signal;
  $('bot-status').textContent = alive ? '运行中' : bot ? '已退出，查看日志' : '未启动';
  $('bot-dot').classList.toggle('online', Boolean(alive));
  $('debug-dir').textContent = active ? '日志目录：' + active.debugDir : '';
  const jobs = data.events?.launches || [], bindings = data.events?.bindings || [];
  $('mpy-status').textContent = data.project?.mpy ? `${bindings.length} 个应用绑定 / ${jobs.filter(j => j.state === 'running').length} 台已启动` : '未启用';
  const rows = bindings.map(binding => ({binding, job:latestJobs.find(j => j.device.deviceId === binding.device.deviceId)}));
  for (const job of jobs) if (!bindings.some(b => b.device.deviceId === job.device.deviceId)) rows.push({job});
  $('launches').replaceChildren(...rows.map(({binding,job}) => {
    const device = binding?.device || job.device;
    const row = node('div', undefined, 'job'), text = node('div');
    text.append(node('strong', job ? labels[job.state] || job.state : '已绑定，尚未运行'), node('p', device.name || device.deviceId, 'mono'));
    text.append(node('p', networkText(job?.network || latestJobs.find(j => j.device.deviceId === device.deviceId && j.network)?.network), 'meta'));
    if (binding) text.append(node('p', `槽位 ${device.slot} · 会话 ${binding.chat.id}`));
    if (job?.error) text.append(node('p', job.error));
    if (job?.connectionWarning && job.state === 'running') text.append(node('p', job.connectionWarning));
    if (binding && !binding.available) text.append(node('p', '设备离线或 bot 执行器未连接'));
    const button = node('button', job ? '更新并运行设备代码' : '上传并运行设备代码');
    button.disabled = working || !data.project?.mpy || !alive || (binding ? !binding.available : job.canRerun === false) ||
      Boolean(job && !['running','failed','completed','stopped','unknown'].includes(job.state));
    button.onclick = () => action(async () => {
      await api(binding ? 'run/device' : 'run/rerun', binding ? {bindingId:binding.bindingId} : {launchId:job.launchId});
      notify('正在更新设备代码，请查看设备进度和日志。');
    });
    const advanced = node('details', undefined, 'device-actions');
    advanced.append(node('summary', '设备高级操作'), node('p', '单独部署 MPY，不重启本地服务。设备将重启，旧应用及数据会被清除，保留引导配置。', 'subtle'), button);
    row.dataset.state = job?.state || 'bound';
    row.append(text,advanced); return row;
  }));
  for (const plan of data.events?.restarts || []) {
    if (jobs.some(j => j.device.deviceId === plan.deviceId)) continue;
    const row = node('div', undefined, 'job');
    row.dataset.state = plan.state;
    row.append(node('strong', plan.state === 'failed' ? '智能体重启未完成' : '等待恢复设备运行'), node('p', plan.deviceId + '：' + plan.message));
    $('launches').append(row);
  }
  if (!rows.length && !(data.events?.restarts || []).length) $('launches').append(node('p', !data.project?.mpy ? '此项目未包含 MPY 入口，可直接调试 bot 和 WebApp。' : active ? '等待 bot 查询已有绑定；首次使用可向 bot 发一条消息，未绑定时在冒泡 App 完成绑定。' : '开始调试后将自动恢复已知会话并查询绑定设备。', 'empty'));
  if (data.events) {
    if (runId !== data.events.runId) { runId = data.events.runId; items = []; after = 0; }
    items = items.concat(data.events.records).slice(-1000); after = data.events.cursor;
    if (data.events.truncated) notify('部分较早日志已超出显示窗口，完整记录仍在 debug/ 目录中。');
    renderLogs();
  }
  renderGuide(data, alive, jobs, bindings);
  updateButtons();
}
function renderGuide(data, alive, jobs, bindings) {
  const active = Boolean(data.run), project = Boolean(data.project);
  const latest = new Map();
  for (const job of jobs) latest.set(job.device.deviceId, job);
  const current = [...latest.values()];
  const failed = current.find(j => j.state === 'failed');
  const deploying = current.some(j => ['accepted','rebooting','connecting','uploading','uploaded'].includes(j.state));
  const preparations = data.events?.restarts || [];
  let title, body, step;
  if (!project) {
    step = 0; title = '打开你的智能体项目'; body = '选择编辑器正在使用的项目目录。Studio 使用同一份代码，不需要复制或上传项目。';
  } else if (!active) {
    step = 1; title = '准备好后，启动智能体'; body = '首次运行请展开“运行设置”，检查 Bot 入口、凭据和WebApp 本地域名。之后点击上方“启动智能体”。';
  } else if (!alive) {
    step = 3; title = 'Bot 尚未运行，请查看日志'; body = '启动过程中请稍候；如果 Bot 已退出，查看下方错误，修改代码或配置后点击“重启智能体”。';
  } else if (preparations.some(p => p.state === 'preparing')) {
    step = 2; title = '正在准备真实设备'; body = data.runtimeConfig?.autoRunMpy ? 'Studio 正在让已绑定设备进入 Python Dev，准备完成后会自动上传并运行 MPY。' : 'Studio 正在让已绑定设备进入 Python Dev。完成后设备会等待你在冒泡 App 中启动应用。';
  } else if (preparations.some(p => p.state === 'failed')) {
    step = 3; title = '设备准备失败，先查看错误'; body = '设备未能进入 Python Dev。请检查设备在线状态和网络，修正后重启智能体。';
  } else if (preparations.some(p => p.state === 'waiting')) {
    step = 2; title = data.runtimeConfig?.autoRunMpy ? '设备已准备好，正在自动运行' : '设备已准备好，去冒泡 App 启动应用'; body = data.runtimeConfig?.autoRunMpy ? 'Studio 正在为已绑定设备自动创建部署任务，请稍候。' : '设备正在 Python Dev 中等待。请按项目说明操作 Bot 或 WebApp；应用发起启动后，Studio 才会上传并运行 MPY。';
  } else if (failed) {
    step = 3; title = '设备应用启动失败，先查看错误'; body = '在运行反馈中选择“设备 · MPY”，查看失败原因。修正后可由应用再次发起部署，或使用设备高级操作。';
  } else if (deploying) {
    step = 2; title = '正在准备设备应用'; body = '请保持电脑、设备与冒泡 App 网络连通。部署进度会自动更新，无需重复发起安装。';
  } else if (data.project.mpy && !bindings.length) {
    step = 2; title = '去冒泡 App，与智能体建立连接'; body = '先给 Bot 发一条消息，Studio 会查询已有绑定。尚未绑定时，按项目说明打开绑定卡片，选择设备；完成后这里自动更新。';
  } else if (data.project.mpy && !current.some(j => j.state === 'running')) {
    step = 2; title = '设备已关联，在冒泡 App 中启动体验'; body = '按项目说明与 Bot 或 WebApp 交互，发起设备应用安装。Studio 会显示上传进度，并收集设备运行日志。';
  } else {
    step = 3; title = '体验智能体，观察真实反馈'; body = '在冒泡 App 或设备上操作，在下方查看日志。修改代码后重启智能体，WebApp 请打开新链接；然后在冒泡 App 中再次启动应用，Studio 会上传当前 MPY。';
  }
  $('guide-title').textContent = title; $('guide-body').textContent = body;
  ['step-project','step-run','step-app','step-logs'].forEach((id,index) => {
    $(id).classList.toggle('current',index===step);
    $(id).classList.toggle('done',index<Math.min(step,2));
    if(index===step) $(id).setAttribute('aria-current','step'); else $(id).removeAttribute('aria-current');
  });
  $('operation-hint').textContent = active
    ? data.runtimeConfig?.autoRunMpy ? '重启会让本轮设备进入 Python Dev，并自动上传、运行 MPY。停止会请求设备普通重启。' : '重启会让本轮设备进入 Python Dev 并重新加载本地服务；MPY 等待冒泡 App 发起启动后上传。停止会请求设备普通重启。'
    : project ? '启动本地 Bot 与可选 WebApp 服务，再到冒泡 App 中体验。' : '先打开本地项目，再启动智能体。';
  $('app-instructions').hidden = !active;
}
let polling = false;
async function pollOnce() {
  if (!token || polling) return;
  polling = true;
  try { render(await api('state?after=' + after + '&runId=' + encodeURIComponent(runId || ''))); }
  catch (error) { $('connection').textContent = '后台连接失败'; notify(error.message, true); }
  finally { polling = false; }
}
async function browse(path) {
  const data = await api('directories' + (path ? '?path=' + encodeURIComponent(path) : ''));
  directory = data; $('directory-path').value = data.path;
  $('directories').replaceChildren(...data.directories.map(d => { const b = node('button', '▸  ' + d.name); b.onclick = () => action(() => browse(d.path)); return b; }));
  if (!data.directories.length) $('directories').append(node('p', '此目录没有可浏览的子目录。', 'empty'));
  $('drives').replaceChildren(...data.drives.map(d => { const b = node('button', d); b.onclick = () => action(() => browse(d)); return b; }));
}
$('browse').onclick = () => action(async () => { await browse(state?.project?.path); $('directory-dialog').showModal(); });
$('close-directory').onclick = () => $('directory-dialog').close();
$('directory-go').onclick = () => action(() => browse($('directory-path').value));
$('directory-path').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('directory-go').click(); } };
$('directory-up').onclick = () => action(() => browse(directory?.parent));
$('choose-directory').onclick = () => action(async () => { await api('project/open', { path: directory.path }); $('directory-dialog').close(); notify('项目已打开，请检查运行入口与 bot 配置。'); });
if (!token) notify('请使用启动终端提供的完整 Studio 地址打开页面。', true);
await pollOnce();
setInterval(async () => {
  await pollOnce();
  if (state?.user && !working && Date.now() - lastRefresh > 15000) { lastRefresh = Date.now(); try { await refreshDevices(); } catch (error) { notify(error.message, true); } }
}, 1000);
setInterval(() => { if (cooldown > 0) { cooldown--; updateButtons(); } }, 1000);
