export class CreatorClient {
  constructor({ baseUrl = '', fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl; this.fetch = fetchImpl; this.session = null; this.devices = []; this.updatedAt = null;
    this.bots = []; this.botTokens = new Map(); this.botsError = ""; this.mps = []; this.mpsError = "";
  }
  configure(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的 API 服务地址');
    if (this.session && url.href.replace(/\/$/, '') !== this.baseUrl) throw new Error('更换服务地址前请退出登录');
    this.baseUrl = url.href.replace(/\/$/, '');
  }
  async request(path, body, token) {
    if (!this.baseUrl) throw new Error('请先填写 CreatorHub API 服务地址');
    const response = await this.fetch(this.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: '*/*', 'Content-Type': 'application/json', ...(token ? { token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (response.status === 401 || data.code === 401) {
      this.session = null; this.devices = []; this.updatedAt = null;
      this.bots = []; this.botTokens.clear(); this.botsError = ""; this.mps = []; this.mpsError = "";
      throw new Error('登录已过期，请重新登录');
    }
    if (!response.ok || ![0, 200].includes(data.code)) {
      // Do not forward an upstream body that might echo credentials.
      throw new Error('冒泡接口请求失败（' + (data.code || response.status) + '），请检查账号、验证码或服务配置');
    }
    return data.result ?? data.results;
  }
  account(body) {
    if (!['PHONE', 'EMAIL'].includes(body.accountType)) throw new Error('请选择手机号或邮箱');
    const account = String(body.account || '').trim();
    if (!account || account.length > 254) throw new Error('请输入手机号或邮箱');
    return { accountType: body.accountType, [body.accountType === 'EMAIL' ? 'email' : 'phone']: account };
  }
  async sendCode(body) {
    this.configure(body.baseUrl);
    await this.request('/creator/auth/code', this.account(body));
  }
  async login(body) {
    if (this.session) throw new Error('请先退出当前账号');
    this.configure(body.baseUrl);
    const code = String(body.code || '').trim();
    if (!code || code.length > 100) throw new Error('请输入验证码');
    const result = await this.request('/creator/auth/login', { ...this.account(body), code, loginType: 'CODE' });
    if (!result?.token || !result?.id) throw new Error('登录接口未返回用户 ID 或 token');
    this.session = { id: String(result.id), name: String(result.name || result.id), token: result.token };
    this.devices = []; this.updatedAt = null;
    this.bots = []; this.botTokens.clear(); this.botsError = ''; this.mps = []; this.mpsError = '';
    try { await this.refreshBots(); } catch (error) { if (!this.session) throw error; }
    try { await this.refreshMps(); } catch (error) { if (!this.session) throw error; }
    return this.publicSession();
  }
  publicSession() { return this.session ? { id: this.session.id, name: this.session.name } : null; }
  async refresh() {
    const session = this.session;
    if (!session) throw new Error('请先登录冒泡账号');
    const result = await this.request('/creator/devices', undefined, session.token);
    if (session !== this.session) throw new Error('登录状态已变化，请刷新');
    if (!Array.isArray(result)) throw new Error('设备接口返回格式错误');
    this.devices = result.filter(d => d?.id).map(d => ({ id: String(d.id), name: String(d.name || d.id), sn: String(d.sn || ''), avatar: String(d.avatar || ''), talId: String(d.talId || ''), online: d.online === 'ONLINE' ? 'ONLINE' : 'OFFLINE' }));
    this.updatedAt = new Date().toISOString();
    return this.devices;
  }
  publicBots() {
    return this.bots.map(bot => ({ ...bot, hasToken: Boolean(this.botTokens.get(bot.id)) }));
  }
  publicMps() {
    return this.mps.map(mps => ({ appName: mps.appName, appId: mps.appId }));
  }
  getMpsToken(appId) {
    const mps = this.mps.find(item => String(item.appId) === String(appId));
    if (!mps?.token) throw new Error('MPS token is not available; refresh MPS and try again');
    return mps.token;
  }
  async refreshMps() {
    const session = this.session;
    if (!session) throw new Error('请先登录冒泡账号');
    try {
      const result = await this.request('/creator/bots/mps', undefined, session.token);
      if (session !== this.session) throw new Error('登录状态已变化，请刷新');
      if (!Array.isArray(result)) throw new Error('MPS 接口返回格式错误');
      this.mps = result.filter(item => item && typeof item === 'object' && item.appId).map(item => ({
        appName: String(item.name || '').trim(), appId: String(item.appId), token: String(item.token || ''),
      }));
      this.mpsError = '';
      return this.publicMps();
    } catch (error) {
      const message = this.session ? '获取 MPS 列表失败，请刷新重试。' : '登录已过期，请重新登录';
      if (session === this.session) this.mpsError = message;
      throw new Error(message);
    }
  }
  async refreshBots() {
    const session = this.session;
    if (!session) throw new Error('请先登录冒泡账号');
    try {
      const result = await this.request('/creator/bots', undefined, session.token);
      if (session !== this.session) throw new Error('登录状态已变化，请刷新');
      if (!Array.isArray(result)) throw new Error('Bot 接口返回格式错误');
      this.bots = result.filter(bot => bot && typeof bot === 'object').map((bot, index) => ({
        key: bot.id ? String(bot.id) : 'missing-id-' + index,
        id: String(bot.id || ''), name: String(bot.name || ''),
        avatar: String(bot.avatar || '').trim(), description: String(bot.description || ''),
      }));
      this.botsError = '';
      return this.publicBots();
    } catch {
      const message = this.session ? '获取 Bot 列表失败，请刷新重试。' : '登录已过期，请重新登录';
      if (session === this.session) this.botsError = message;
      throw new Error(message);
    }
  }
  setBotToken(id, value) {
    if (!this.session) throw new Error('请先登录冒泡账号');
    if (!id || !this.bots.some(bot => bot.id === id)) throw new Error('请选择当前账号下的 Bot');
    const token = String(value || '').trim();
    if (!token || token.length > 4096) throw new Error('请输入有效的 Bot token');
    this.botTokens.set(id, token);
  }
  getBotToken(id) {
    if (!this.session) throw new Error('请先登录冒泡账号');
    if (!id || !this.bots.some(bot => bot.id === id)) throw new Error('请选择当前账号下的 Bot');
    const token = this.botTokens.get(id);
    if (!token) throw new Error('请先在“我的冒泡”中设置此 Bot 的 token');
    return token;
  }
  async botSlots(botToken) {
    const session = this.session;
    if (!session) throw new Error('请先登录冒泡账号');
    if (!botToken) throw new Error('尚未设置 Bot token');
    let result;
    try {
      result = await this.request('/creator/bot/slot-details?botToken=' + encodeURIComponent(botToken), undefined, session.token);
    } catch {
      throw new Error(this.session ? '无法查询设备槽位，请检查 Bot token 和网络后重试' : '登录已过期，请重新登录');
    }
    if (session !== this.session) throw new Error('登录状态已变化，请刷新');
    const list = Array.isArray(result) ? result : result?.list;
    if (!Array.isArray(list)) throw new Error('设备槽位接口返回格式错误');
    return list.filter(slot => slot?.id).map(slot => ({
      id: String(slot.id), talId: String(slot.talId || ''),
      compatible: Array.isArray(slot.compatible) ? slot.compatible.filter(id => typeof id === 'string') : [],
      device: slot.device?.id ? {
        id: String(slot.device.id), name: String(slot.device.name || slot.device.id),
        sn: String(slot.device.sn || ''), avatar: String(slot.device.avatar || ''),
        online: slot.device.online === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      } : null,
    }));
  }
  async bindBotSlot(botToken, slotId, deviceId) {
    const session = this.session;
    if (!slotId || !deviceId) throw new Error('请选择槽位和设备');
    const slots = await this.botSlots(botToken);
    const devices = await this.refresh();
    const slot = slots.find(item => item.id === slotId);
    const device = devices.find(item => item.id === deviceId);
    if (!slot) throw new Error('当前 Bot 中已不存在此槽位，请刷新');
    if (!device) throw new Error('目标设备未绑定在当前登录用户下');
    if (!device.talId || ![slot.talId, ...slot.compatible].includes(device.talId)) throw new Error('设备类型与此槽位不兼容');
    if (session !== this.session) throw new Error('登录状态已变化，请刷新');
    await this.request('/creator/bot/slot/device/bind', { slotId, deviceId }, session.token);
  }
  async authorize(ref, { allowOffline = false } = {}) {
    if (!ref?.deviceId || !ref?.slotId) throw new Error('SDK 调用缺少目标设备或绑定槽位');
    const devices = await this.refresh();
    const device = devices.find(d => d.id === String(ref.deviceId));
    if (!device) throw new Error('目标设备未绑定在当前登录用户下');
    if (device.online !== 'ONLINE' && !allowOffline) throw new Error('目标设备当前离线');
    return { deviceId: device.id, slotId: String(ref.slotId) };
  }
  async logout() {
    const session = this.session;
    this.session = null; this.devices = []; this.updatedAt = null;
    this.bots = []; this.botTokens.clear(); this.botsError = ''; this.mps = []; this.mpsError = '';
    if (session) await this.request('/creator/auth/logout', {}, session.token);
  }
}
