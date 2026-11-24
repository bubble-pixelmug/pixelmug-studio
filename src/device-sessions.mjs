import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sameBinding = (a, b) => a.device.deviceId === b.device.deviceId &&
  a.device.slotId === b.device.slotId && a.scope?.botKey === b.scope?.botKey &&
  a.scope?.chat?.id === b.scope?.chat?.id && a.scope?.chat?.type === b.scope?.chat?.type;

// Slot snapshots describe the UI. These sessions separately own actual device work.
export class DeviceSessions {
  constructor(manager) {
    this.manager = manager;
    this.epoch = 0;
    this.devices = new Map();
    this.pending = new Map();
    this.results = new Map();
  }
  forBinding(record) {
    const previous = this.devices.get(record.device.deviceId);
    if (previous && !previous.revoked && previous.epoch === this.epoch && sameBinding(previous.record, record)) {
      previous.record = record;
      return previous;
    }
    const token = { record, epoch: this.epoch, revoked: false,
      recoveryNeeded: Boolean(previous?.revoked || this.results.has(record.device.deviceId)) };
    this.devices.set(record.device.deviceId, token);
    return token;
  }
  forRef(ref, context) {
    const record = [...this.manager.bindings.records.values()].find(r =>
      r.device.deviceId === ref.deviceId && r.device.slotId === ref.slotId &&
      (!this.manager.requireTestChat || this.manager.bindings.matches(r.scope)));
    return this.forBinding(record || { device: ref, contextId: ref.contextId, executor: context.executor });
  }
  assert(token) {
    if (!token) return; // Older standalone/CLI jobs have no chat session.
    const m = this.manager;
    if (token.revoked || token.epoch !== this.epoch || m.stopping || m.stopped || m.switchingChat ||
        (m.requireTestChat && !m.bindings.matches(token.record.scope))) {
      const error = new Error('Studio device session expired after a chat or binding change');
      error.code = 'STUDIO_SESSION_EXPIRED';
      throw error;
    }
  }
  async ready(token) {
    this.assert(token);
    await this.pending.get(token.record.device.deviceId);
    this.assert(token);
  }
  retire(record) {
    const token = this.devices.get(record.device.deviceId);
    if (!token || !sameBinding(token.record, record)) return;
    return this.cleanup(token);
  }
  invalidateAll() {
    this.epoch++;
    for (const token of this.devices.values()) this.cancel(token);
  }
  cancel(token) {
    token.revoked = true;
    const jobs = [token.job, token.preparation].filter(Boolean);
    for (const job of jobs) {
      job.abort.abort();
      clearInterval(job.healthTimer);
      clearTimeout(job.rerunTimer);
      job.repl?.cancelOperations?.();
      if (job.connectingRepl !== job.repl) job.connectingRepl?.close();
    }
    for (const [id, command] of this.manager.commands) {
      if (jobs.includes(command.job) && !command.delivered) {
        clearTimeout(command.timer);
        this.manager.commands.delete(id);
        command.reject(new Error('Device session cancelled before RPC delivery'));
      }
    }
  }
  cleanup(token) {
    const id = token.record.device.deviceId;
    if (this.pending.has(id)) return this.pending.get(id);
    if (token.cleaned) return Promise.resolve(this.results.get(id));
    if (!token.job && !token.preparation) { this.cancel(token); token.cleaned = true; return Promise.resolve(); }
    this.cancel(token);
    const work = this.cleanupOnce(token).finally(() => {
      if (this.pending.get(id) === work) this.pending.delete(id);
    });
    this.pending.set(id, work);
    return work;
  }
  async cleanupOnce(token) {
    const m = this.manager, record = token.record;
    const job = token.job || token.preparation;
    const result = { deviceId: record.device.deviceId, slotId: record.device.slotId,
      chat: record.scope?.chat, status: 'unconfirmed' };
    try {
      // Do not close an authenticated socket until it has had a chance to stop MPY.
      await Promise.allSettled([token.job?.work, token.preparationWork]);
      if (!job) throw new Error('No device execution session is available for cleanup');
      let rpcError;
      try {
        const client = m.clients.get(record.executor.key);
        if (!client?.lastPollAt || Date.now() - client.lastPollAt > 10000) throw new Error('Bot executor is unavailable');
        const value = await m.rpc({ ...job, executor: record.executor, cleanup: true, abort: new AbortController() },
          'talRebootDevice', m.timings.rpcTimeout);
        if (value !== true) throw new Error('Device did not accept its normal reboot');
        result.method = 'rpc';
      } catch (error) { rpcError = error; }
      if (rpcError) {
        if (!token.job?.repl || token.job.repl.closed || token.job.repl.lastError || !token.job.repl.reboot) {
          if (rpcError.code === 'STUDIO_BINDING_CHANGED' || /Device binding changed; refusing auxiliary RPC/.test(rpcError.message)) {
            const error = new Error('旧设备绑定已解除，且无可用的 WebREPL 连接，无法确认停止旧设备。');
            error.code = 'STUDIO_CLEANUP_UNREACHABLE';
            throw error;
          }
          throw rpcError;
        }
        // This is the original authenticated connection, never a fresh connection to a stale IP.
        await token.job.repl.reboot(message => m.log(job, 'info', 'Device cleanup: ' + message, 'studio'));
        result.method = 'webrepl';
      }
      result.status = 'rebootAccepted';
      result.message = 'Normal reboot requested; recovery is verified before reusing this device.';
      if (token.job) m.state(token.job, 'stopped');
    } catch (error) {
      result.message = error.message || String(error);
      if (error.code) result.code = error.code;
      if (token.job) m.state(token.job, 'unknown', 'Device cleanup not confirmed: ' + result.message);
    } finally {
      token.cleaned = true;
      token.job?.repl?.close();
      this.results.set(result.deviceId, result);
      if (m.jobs.get(result.deviceId)?.session === token) m.jobs.delete(result.deviceId);
      if (m.restartPlans.get(result.deviceId)?.session === token) m.restartPlans.delete(result.deviceId);
      m.autoRunDevices.delete(result.deviceId);
      this.save();
    }
    return result;
  }
  async stopAll() {
    const work = [];
    for (const token of this.devices.values()) work.push(this.cleanup(token));
    await Promise.all([...this.pending.values(), ...work]);
    const devices = [...this.results.values()];
    return { devices, unconfirmed: devices.filter(d => d.status !== 'rebootAccepted').length };
  }
  async recover(token, commandJob) {
    await this.ready(token);
    if (!token.recoveryNeeded) return;
    const m = this.manager;
    let rebootRequested = this.results.get(token.record.device.deviceId)?.status === 'rebootAccepted';
    if (rebootRequested) await m.wait(m.timings.rebootWait, commandJob.abort.signal);
    await m.retry(commandJob, m.timings.onlineTimeout, async () => {
      let status = await m.rpc(commandJob, 'talMpyGetStudioState', 5000);
      this.assert(token);
      if (typeof status === 'string') status = JSON.parse(status);
      if (status?.protocol === 1 && status.mode === 'normal' && status.wifiConnected && status.maopaoConnected) return;
      if (!rebootRequested && status?.mode === 'MpyReplMode') {
        // An earlier cleanup was impossible. The newly selected binding now authorizes takeover.
        const accepted = await m.rpc(commandJob, 'talRebootDevice', m.timings.rpcTimeout);
        if (accepted !== true) throw new Error('Device did not accept recovery reboot');
        rebootRequested = true;
        await m.wait(m.timings.rebootWait, commandJob.abort.signal);
      }
      throw new Error('Waiting for the previous device session to finish rebooting');
    });
    this.assert(token);
    token.recoveryNeeded = false;
    this.results.delete(token.record.device.deviceId);
    this.save();
  }
  warnings() { return [...this.results.values()].filter(d => d.status !== 'rebootAccepted'); }
  save() {
    mkdirSync(this.manager.debugDir, { recursive: true });
    writeFileSync(join(this.manager.debugDir, 'device-cleanup.json'), JSON.stringify([...this.results.values()], null, 2));
  }
}
