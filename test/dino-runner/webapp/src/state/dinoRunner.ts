import { computed, reactive, watch } from 'vue';
import { hasJeeWebBridge, loadPixelMug, sendDinoBestScoreToBot } from '../template/bubbleClient';
import { openMpsApp } from '../template/mpsLaunch';
import { useBleSession } from '../template/bleSession';
import { SimpleJumpSender } from './simpleJumpSender';
import { t } from '../i18n';
import type { AppStatus, DeviceInfo, DinoGameState } from '../types';

type LaunchPhase = 'idle' | 'requesting' | 'preparing' | 'switching' | 'ready' | 'failed';
type DinoEventMessage = {
  event?: string;
  state?: DinoGameState;
  score?: number;
  lastScore?: number;
  bestScore?: number;
};

const BEST_SCORE_KEY = 'mps-dino-runner-best-score';
const MAX_SCORE = 9999;
const SIMPLE_JUMP = 0x4A;

const state = reactive({
  status: 'idle' as AppStatus,
  message: '',
  device: null as DeviceInfo | null,
  bleState: 'idle',
  launchPhase: 'idle' as LaunchPhase,
  gameState: 'unknown' as DinoGameState,
  score: 0,
  lastScore: 0,
  bestScore: loadBestScore(),
  lastEvent: '',
});

let bleSession: ReturnType<typeof useBleSession> | null = null;
let dataCleanup: (() => void) | null = null;
let readyCleanup: (() => void) | null = null;
let lastStateReportAt = 0;

function getBle() {
  if (!bleSession) {
    bleSession = useBleSession();
  }
  return bleSession;
}

const busy = computed(() => ['loading', 'installing', 'connecting', 'syncing'].includes(state.status));
const canSend = computed(() => Boolean(state.device) && getBle().isReady.value);
const jumpSender = new SimpleJumpSender({
  canSend: () => canSend.value,
  send: async () => {
    const result = await getBle().sendSimpleRaw(new Uint8Array([SIMPLE_JUMP]));
    if (result?.accepted === false) throw new Error('Simple BLE jump was not accepted.');
  },
  onError: error => {
    state.status = 'error';
    state.message = errorMessage(error);
  },
});
watch(() => state.device, () => jumpSender.clear(), { flush: 'sync' });
const canEnter = computed(() => state.launchPhase === 'ready');
const statusText = computed(() => {
  if (!state.message) return '';
  return hasJeeWebBridge() ? state.message : `${state.message} ${t('status.browserMock')}`;
});
const openButtonLabel = computed(() => {
  if (busy.value) return t('landing.opening');
  if (state.launchPhase === 'ready') return t('landing.enter');
  if (state.launchPhase === 'failed') return t('landing.retry');
  return t('landing.install');
});
const stateLabel = computed(() => {
  if (state.gameState === 'running') return t('game.state.running');
  if (state.gameState === 'paused') return t('game.state.paused');
  if (state.gameState === 'gameover') return t('game.state.gameover');
  if (state.gameState === 'ready') return t('game.state.ready');
  return t('game.state.unknown');
});

watch(
  () => state.bestScore,
  (score) => {
    localStorage.setItem(BEST_SCORE_KEY, String(clampScore(score)));
  },
);

export function useDinoRunner() {
  async function refreshDevice() {
    state.status = 'loading';
    state.message = t('status.findingDevice');
    try {
      const result = await loadPixelMug();
      state.device = result;
      state.status = result ? 'ready' : 'error';
      state.message = result ? t('status.deviceReady') : t('status.deviceMissing');
    } catch (error) {
      state.status = 'error';
      state.message = errorMessage(error);
    }
  }

  async function openOnDevice() {
    if (!state.device) {
      await refreshDevice();
    }

    const target = state.device || (await loadPixelMug());
    if (!target) {
      state.status = 'error';
      state.message = t('status.deviceMissing');
      return false;
    }

    state.device = target;
    state.status = 'installing';
    state.launchPhase = 'requesting';
    state.message = t('status.launching');
    try {
      await openMpsApp(target, undefined, {
        onPhase: updateLaunchPhase,
      });
      markLaunchReady();
      return true;
    } catch (error) {
      state.status = 'error';
      state.launchPhase = 'failed';
      state.message = errorMessage(error);
      return false;
    }
  }

  async function connectDevice() {
    const target = state.device || (await loadPixelMug());
    if (!target) {
      state.status = 'error';
      state.message = t('status.deviceMissing');
      return;
    }

    state.device = target;
    state.status = 'connecting';
    state.message = t('status.connectingBle');
    const ble = getBle();
    try {
      await ble.ensureConnected(target);
      state.bleState = ble.state.connection;
      state.status = 'connected';
      state.message = t('status.bleConnected');
      await syncDeviceStateToBot('connected');
    } catch (error) {
      state.status = 'error';
      state.message = errorMessage(error);
    }
  }

  async function jump() {
    const restarting = state.gameState === 'gameover';
    const sent = await jumpSender.submit();
    if (!sent) return;
    state.status = 'connected';
    if (restarting && state.gameState === 'gameover') {
      state.score = 0;
      state.gameState = 'running';
    }

    if (!hasJeeWebBridge()) {
      mockRunning();
    }
  }

  function bindBleState() {
    refreshDevice();
    const ble = getBle();
    const cleanupState = ble.bindState();
    dataCleanup?.();
    dataCleanup = ble.bindData(handleBleData);
    readyCleanup?.();
    readyCleanup = watch(
      () => ble.state.connection,
      (connection, previous) => {
        state.bleState = connection;
        if (connection !== 'ready') jumpSender.clear();
        if (connection === 'ready' && previous && previous !== 'ready') {
          void syncDeviceStateToBot(previous === 'idle' ? 'connected' : 'reconnected');
        }
      },
      { flush: 'sync' },
    );
    return () => {
      jumpSender.clear();
      cleanupState();
      dataCleanup?.();
      dataCleanup = null;
      readyCleanup?.();
      readyCleanup = null;
    };
  }

  return {
    state,
    busy,
    canSend,
    canEnter,
    openButtonLabel,
    stateLabel,
    statusText,
    bindBleState,
    connectDevice,
    jump,
    openOnDevice,
    refreshDevice,
  };
}

function handleBleData(event: { message?: unknown }) {
  const message = event.message as DinoEventMessage | undefined;
  if (!message) return;
  if (message.event === 'dinoGameOver') {
    applyDinoStatus(message, 'gameover');
    reportScoreToBot('gameover');
    return;
  }
  if (message.event === 'state' || message.event === 'stateChanged') {
    applyDinoStatus(message);
  }
}

async function syncDeviceStateToBot(reason: string) {
  const now = Date.now();
  if (now - lastStateReportAt < 1200) return;
  lastStateReportAt = now;

  const target = state.device;
  if (!target) return;

  try {
    const response = await getBle().send(target, {
      method: 'dinoGetState',
      id: `dino_state_${now}`,
    }, {
      priority: 1,
      timeoutMillis: 2500,
    });
    const payload = responsePayload(response) as DinoEventMessage | undefined;
    if (payload) applyDinoStatus(payload);
    reportScoreToBot(reason);
  } catch (error) {
    console.warn('[dino-runner] failed to sync device state', error);
  }
}

function applyDinoStatus(message: DinoEventMessage, fallbackState?: DinoGameState) {
  state.lastEvent = message.event || state.lastEvent;
  if (message.state) {
    state.gameState = message.state;
  } else if (fallbackState) {
    state.gameState = fallbackState;
  }
  if (typeof message.score === 'number') {
    state.score = clampScore(message.score);
  }
  if (typeof message.lastScore === 'number') {
    state.lastScore = clampScore(message.lastScore);
  } else if (fallbackState === 'gameover') {
    state.lastScore = state.score;
  }
  if (typeof message.bestScore === 'number') {
    state.bestScore = Math.max(state.bestScore, clampScore(message.bestScore));
  } else {
    state.bestScore = Math.max(state.bestScore, state.score);
  }
}

function reportScoreToBot(reason: string) {
  sendDinoBestScoreToBot({
    event: 'dinoGameOver',
    score: state.score,
    lastScore: state.lastScore,
    bestScore: state.bestScore,
    reportedAt: Date.now(),
    reason,
  });
}

function responsePayload(response: unknown) {
  const item = response as { result?: unknown; message?: unknown } | undefined;
  const result = item?.result as { result?: unknown; message?: unknown } | undefined;
  return result?.result || result?.message || item?.message || item?.result || response;
}

function mockRunning() {
  state.gameState = 'running';
  state.score = clampScore(state.score + 1);
  state.bestScore = Math.max(state.bestScore, state.score);
}

function markLaunchReady() {
  state.status = 'ready';
  state.launchPhase = 'ready';
  state.message = t('status.launchReady');
}

function updateLaunchPhase(phase: LaunchPhase) {
  state.launchPhase = phase;
  if (phase === 'requesting') {
    state.message = t('status.launching');
  } else if (phase === 'preparing') {
    state.message = t('status.preparing');
  } else if (phase === 'switching') {
    state.message = t('status.switching');
  } else if (phase === 'ready') {
    state.message = t('status.launchReady');
  }
}

function loadBestScore() {
  const value = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
  return clampScore(value);
}

function clampScore(value: unknown) {
  const next = Math.floor(Number(value));
  return Number.isFinite(next) ? Math.max(0, Math.min(MAX_SCORE, next)) : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || t('status.unknownError'));
}

