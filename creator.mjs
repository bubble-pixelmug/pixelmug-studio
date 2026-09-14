export class CreatorClient {
  constructor({ baseUrl = '', fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl; this.fetch = fetchImpl; this.session = null; this.devices = []; this.updatedAt = null;
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
      headers: { 'Content-Type': 'application/json', ...(token ? { token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (response.status === 401 || data.code === 401) {
      this.session = null; this.devices = []; this.updatedAt = null;
      throw new Error('登录已过期，请重新登录');
    }
    if (!response.ok || data.code !== 200) {
      // Do not forward an upstream body that might echo credentials.
      throw new Error('冒泡接口请求失败（' + (data.code || response.status) + '），请检查账号、验证码或服务配置');
    }
    return data.result;
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
    return this.publicSession();
  }
  publicSession() { return this.session ? { id: this.session.id, name: this.session.name } : null; }
  async refresh() {
    const session = this.session;
    if (!session) throw new Error('请先登录冒泡账号');
    const result = await this.request('/creator/devices', undefined, session.token);
    if (session !== this.session) throw new Error('登录状态已变化，请刷新');
    if (!Array.isArray(result)) throw new Error('设备接口返回格式错误');
    this.devices = result.filter(d => d?.id).map(d => ({ id: String(d.id), name: String(d.name || d.id), sn: String(d.sn || ''), online: d.online === 'ONLINE' ? 'ONLINE' : 'OFFLINE' }));
    this.updatedAt = new Date().toISOString();
    return this.devices;
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
    if (session) await this.request('/creator/auth/logout', {}, session.token);
  }
}