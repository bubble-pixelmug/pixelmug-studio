import type { DeviceInfo } from '../types';
import {
  getWebApp,
  hasJeeWebBridge,
  onPixelMugEvent,
  subscribePixelMugEvents,
} from './bubbleClient';
import type { DeviceEventItem, DeviceEventPayload } from './bubbleClient';

declare global {
  var __PIXELMUG_STUDIO_DEBUG__: { enabled?: boolean } | undefined;
}

export type MpsLaunchConfig = {
  id: string;
  version: string;
};

export type MpsLaunchPhase = 'requesting' | 'preparing' | 'switching' | 'ready' | 'failed';

const DEV_MPS_ID = import.meta.env.VITE_MPS_ID || '7048139265';
const DEV_MPS_VERSION = import.meta.env.VITE_MPS_VERSION || '0.0.1';
const MPS_OPEN_TIMEOUT_MS = 45000;
const READY_EVENTS = new Set(['MPS_IS_RUNNING']);
const FAILED_EVENTS = new Set(['INSTALL_FAIL', 'RUNNING_FAIL']);
const MPY_VM_ERROR_EVENT = 'mpyVmError';
const MPY_VM_STATE_EVENT = 'mpyVmEvent';
const RUNNING_FAIL_MESSAGE = 'Install success. App internal error';

let pendingLaunch:
  | {
      deviceKey: string;
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onPhase?: (phase: MpsLaunchPhase) => void;
    }
  | null = null;
let mpsEventBound = false;
const lastMpsEventByDevice = new Map<string, string>();
const lastMpsErrorByDevice = new Map<string, MpsInstallError>();

type MpsInstallError = {
  code: string;
};

export function getMpsLaunchConfig(): MpsLaunchConfig {
  const params = new URLSearchParams(globalThis.location?.search || '');
  return {
    id: cleanLaunchParam(params.get('mps_id'), DEV_MPS_ID),
    version: cleanLaunchParam(params.get('mps_version'), DEV_MPS_VERSION),
  };
}

export async function installMpsApp(device: DeviceInfo, config = getMpsLaunchConfig()) {
  if (globalThis.__PIXELMUG_STUDIO_DEBUG__?.enabled === true) {
    const runtimeModule = '/studio-runtime/StudioMpsAdapter.js';
    const { studioInstallMps } = await import(/* @vite-ignore */ runtimeModule);
    return studioInstallMps(getWebApp(), device, MPS_OPEN_TIMEOUT_MS);
  }
  const rpc = {
    method: 'talMpyExecOneScript',
    params: {
      id: config.id,
      version: config.version,
    },
  };

  if (!hasJeeWebBridge()) {
    return { code: 200, result: { value: 264 }, mock: true, config };
  }

  return getWebApp().callDevice(device, rpc);
}

export async function openMpsApp(
  device: DeviceInfo,
  config = getMpsLaunchConfig(),
  options: {
    timeoutMs?: number;
    onPhase?: (phase: MpsLaunchPhase) => void;
  } = {},
) {
  options.onPhase?.('requesting');
  lastMpsEventByDevice.delete(deviceKey(device));

  if (!hasJeeWebBridge()) {
    options.onPhase?.('ready');
    return { code: 264, result: { value: 264 }, mock: true, config };
  }

  await bindMpsEvents();
  await subscribePixelMugEvents(device);

  const waitForReady = waitForMpsRunning(device, {
    timeoutMs: options.timeoutMs,
    onPhase: options.onPhase,
  });
  let result;
  try {
    result = await installMpsApp(device, config);
  } catch (error) {
    clearPendingLaunch();
    options.onPhase?.('failed');
    throw error;
  }
  const code = mpyExecReturnCode(result);

  if (code === 264) {
    clearPendingLaunch();
    options.onPhase?.('ready');
    return result;
  }

  if (code === 263 || code === 265) {
    options.onPhase?.('switching');
  } else if (code === 260 || code === 261 || code === 262) {
    options.onPhase?.('preparing');
  } else {
    clearPendingLaunch();
    options.onPhase?.('failed');
    throw new Error('Could not open app.');
  }

  try {
    await waitForReady;
    options.onPhase?.('ready');
    return result;
  } catch (error) {
    options.onPhase?.('failed');
    throw error;
  }
}

function cleanLaunchParam(value: string | null, fallback: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return fallback;
  return trimmed;
}

async function bindMpsEvents() {
  if (!hasJeeWebBridge() || mpsEventBound) return;
  onPixelMugEvent(handleMpsDeviceEvent);
  mpsEventBound = true;
}

function waitForMpsRunning(
  device: DeviceInfo,
  options: {
    timeoutMs?: number;
    onPhase?: (phase: MpsLaunchPhase) => void;
  } = {},
) {
  if (!hasJeeWebBridge()) return Promise.resolve();

  const key = deviceKey(device);
  const lastEvent = lastMpsEventByDevice.get(key);
  if (lastEvent && READY_EVENTS.has(lastEvent)) return Promise.resolve();
  if (lastEvent && FAILED_EVENTS.has(lastEvent)) {
    return Promise.reject(launchErrorForFailedEvent(lastEvent, key));
  }

  clearPendingLaunch();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingLaunch?.deviceKey === key) {
        pendingLaunch = null;
      }
      reject(new Error('Could not confirm the app opened.'));
    }, options.timeoutMs || MPS_OPEN_TIMEOUT_MS);

    pendingLaunch = { deviceKey: key, resolve, reject, timer, onPhase: options.onPhase };
  });
}

function handleMpsDeviceEvent(event: DeviceEventPayload) {
  const device = event.payload?.device;
  const events = event.payload?.events || [];
  const key = device ? deviceKey(device) : '';

  for (const item of events) {
    const eventName = item.method || item.name;
    if (eventName === MPY_VM_ERROR_EVENT) {
      const installError = parseMpsInstallError(item);
      if (key) lastMpsErrorByDevice.set(key, installError);

      if (pendingLaunch && (!key || pendingLaunch.deviceKey === key)) {
        const pending = pendingLaunch;
        pendingLaunch = null;
        clearTimeout(pending.timer);
        pending.reject(formatMpsInstallError(installError));
      }
      continue;
    }

    if (eventName !== MPY_VM_STATE_EVENT) continue;
    const value = String(item.params?.value || '');
    if (!value) continue;

    if (key) lastMpsEventByDevice.set(key, value);

    if (pendingLaunch && (!key || pendingLaunch.deviceKey === key)) {
      if (value === 'INSTALL_START' || value === 'INSTALL_SUCCESS') {
        pendingLaunch.onPhase?.('preparing');
      }

      if (READY_EVENTS.has(value)) {
        const pending = pendingLaunch;
        pendingLaunch = null;
        clearTimeout(pending.timer);
        pending.resolve();
      } else if (FAILED_EVENTS.has(value)) {
        const pending = pendingLaunch;
        pendingLaunch = null;
        clearTimeout(pending.timer);
        pending.reject(launchErrorForFailedEvent(value, key));
      }
    }
  }
}

function launchErrorForFailedEvent(value: string, key: string) {
  if (value === 'RUNNING_FAIL') {
    return new Error(RUNNING_FAIL_MESSAGE);
  }

  const installError = key ? lastMpsErrorByDevice.get(key) : undefined;
  if (installError) {
    return formatMpsInstallError(installError);
  }

  return new Error('Could not open app.');
}

function parseMpsInstallError(item: DeviceEventItem): MpsInstallError {
  const rawValue = String(item.params?.value || '');
  return {
    code: parseInstallErrorCode(rawValue) || 'unknown',
  };
}

function formatMpsInstallError(error: MpsInstallError) {
  return new Error(`install error: code ${error.code}`);
}

function parseInstallErrorCode(value: string) {
  const match = value.match(/INSTALL_ERROR:([-+]?\d+)/);
  return match?.[1] || '';
}

function clearPendingLaunch() {
  if (!pendingLaunch) return;
  clearTimeout(pendingLaunch.timer);
  pendingLaunch = null;
}

function mpyExecReturnCode(response: unknown) {
  const data = response as {
    code?: unknown;
    result?: unknown;
    value?: unknown;
  };
  const result = data?.result as { value?: unknown } | number | string | undefined;
  const value = typeof result === 'object' && result !== null ? result.value : result ?? data?.value;
  const code = Number(value);
  return Number.isFinite(code) ? code : Number(data?.code);
}

function deviceKey(device: DeviceInfo) {
  const raw = device.raw as { slot?: { id?: string | number }; device?: { id?: string | number } } | undefined;
  return String(device.deviceId || raw?.device?.id || device.slotId || raw?.slot?.id || `${device.talId || 'device'}:${device.slot || ''}`);
}

