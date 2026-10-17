import { computed, reactive } from 'vue';
import type { DeviceInfo } from '../types';
import { getWebApp, hasJeeWebBridge } from './bubbleClient';
import { BleAppClient, isBleAppDisconnectError } from '@jeejio-bubble/bot/sdk/BleAppClient.js';

type BlePayload = Record<string, unknown>;

type ConnectionEvent = {
  connection?: string;
  message?: string;
  lastError?: string;
};

const READY_STATE = 'ready';
const UNAVAILABLE_STATES = new Set(['disconnected', 'failed']);
const ACK_READY_GRACE_MS = 8000;
const BLE_CONNECT_TIMEOUT_MS = 20000;
const BLE_SEND_TIMEOUT_MS = 9000;
const TRANSIENT_UNAVAILABLE_GRACE_MS = 1800;
const BLE_CONNECT_TIMEOUT_MESSAGE = 'connecting ble time out.';
const BLE_CONNECTING_MESSAGE = 'Connecting BLE...';
const BLE_DISCONNECTED_MESSAGE = 'BLE disconnected.';

const state = reactive({
  connection: 'idle',
  message: '',
  lastError: '',
});

let currentDevice: DeviceInfo | null = null;
let protocolClient: BleAppClient | null = null;
let clientStateBound = false;

const isReady = computed(() => state.connection === READY_STATE || !hasJeeWebBridge());
const isConnecting = computed(() => state.connection === 'connecting' || Boolean(getClientConnecting()));
const isUnavailable = computed(() => UNAVAILABLE_STATES.has(state.connection));

export function useBleSession() {
  async function ensureConnected(device: DeviceInfo) {
    currentDevice = device;
    if (!hasJeeWebBridge()) {
      state.connection = READY_STATE;
      state.message = 'BLE mock connected.';
      return;
    }

    try {
      await getProtocolClient().ensureConnected(device, connectOptions());
    } catch (error) {
      applyConnectionFailure(error);
      throw error;
    }
  }

  async function reconnect() {
    if (!currentDevice || !hasJeeWebBridge()) return;
    try {
      await getProtocolClient().reconnect(connectOptions());
    } catch (error) {
      applyConnectionFailure(error);
      throw error;
    }
  }

  async function send(device: DeviceInfo, payload: BlePayload, options: Record<string, unknown> = {}) {
    await ensureConnected(device);

    if (!hasJeeWebBridge()) {
      return { code: 200, result: payload, mock: true };
    }

    try {
      return await getProtocolClient().send(device, payload, {
        writeType: 'withResponse',
        timeoutMillis: BLE_SEND_TIMEOUT_MS,
        ...options,
      });
    } catch (error) {
      applyError(error);
      throw error;
    }
  }

  async function sendSimpleRaw(data: Uint8Array) {
    if (!currentDevice) throw new Error('BLE device is not selected.');

    if (!hasJeeWebBridge()) {
      return { code: 200, accepted: true, bytes: data.byteLength, mock: true };
    }

    try {
      return await getProtocolClient().sendSimpleRaw(data, {
        device: currentDevice,
        ...connectOptions(),
      });
    } catch (error) {
      applyError(error);
      throw error;
    }
  }

  function bindState() {
    if (!hasJeeWebBridge()) return () => undefined;
    const client = getProtocolClient();
    const listener = (event: ConnectionEvent) => applyConnectionEvent(event);
    client.on('connectionState', listener);
    return () => {
      client.off('connectionState', listener);
    };
  }

  function bindData(handler: (event: { message?: unknown; text?: string; raw?: unknown }) => void) {
    if (!hasJeeWebBridge()) return () => undefined;
    const client = getProtocolClient();
    client.on('data', handler);
    return () => {
      client.off('data', handler);
    };
  }

  return {
    state,
    isReady,
    isConnecting,
    isUnavailable,
    bindState,
    bindData,
    ensureConnected,
    reconnect,
    send,
    sendSimpleRaw,
  };
}

function getProtocolClient() {
  if (!protocolClient) {
    protocolClient = new BleAppClient(getWebApp().ble!, {
      appId: 'DinoRunner',
      appVersion: '1.0.5',
      timeoutMillis: BLE_SEND_TIMEOUT_MS,
      sendTimeoutMillis: BLE_SEND_TIMEOUT_MS,
      connectTimeoutMillis: BLE_CONNECT_TIMEOUT_MS,
      readyGraceMillis: ACK_READY_GRACE_MS,
      transientUnavailableGraceMillis: TRANSIENT_UNAVAILABLE_GRACE_MS,
      retries: 1,
      heartbeatMillis: -1,
    } as Record<string, unknown>);
  }
  if (!clientStateBound) {
    protocolClient.on('connectionState', applyConnectionEvent);
    clientStateBound = true;
  }
  return protocolClient;
}

function connectOptions() {
  return {
    connectingMessage: BLE_CONNECTING_MESSAGE,
    connectTimeoutMillis: BLE_CONNECT_TIMEOUT_MS,
    connectTimeoutMessage: BLE_CONNECT_TIMEOUT_MESSAGE,
    readyGraceMillis: ACK_READY_GRACE_MS,
    sendTimeoutMillis: BLE_SEND_TIMEOUT_MS,
  };
}

function getClientConnecting() {
  return protocolClient?.state.connection === 'connecting';
}

function applyConnectionEvent(event: ConnectionEvent) {
  const next = String(event.connection || 'unknown');
  state.connection = next;
  state.lastError = String(event.lastError || '');

  if (next === READY_STATE) {
    state.message = 'BLE connected.';
    return;
  }

  if (next === 'connecting') {
    state.message = BLE_CONNECTING_MESSAGE;
    return;
  }

  if (UNAVAILABLE_STATES.has(next) || next === 'idle' || next === 'unknown') {
    state.message = BLE_DISCONNECTED_MESSAGE;
    return;
  }

  state.message = event.message || BLE_DISCONNECTED_MESSAGE;
}

function applyError(error: unknown) {
  state.lastError = errorMessage(error);
  state.message = state.lastError;
  if (isBleAppDisconnectError(error)) {
    state.connection = 'failed';
  }
}

function applyConnectionFailure(error: unknown) {
  const message = errorMessage(error);
  state.connection = 'failed';
  state.lastError = message;
  state.message = message;
  if (protocolClient) {
    protocolClient.state.connection = 'failed';
    protocolClient.state.lastError = message;
    protocolClient.state.message = message;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

