<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { t } from '../../i18n';
import { hasJeeWebBridge } from '../bubbleClient';
import { useBleSession } from '../bleSession';

const READY_HIDE_MS = 2000;
const CONNECT_COUNTDOWN_SECONDS = 20;

const ble = useBleSession();
const showReady = ref(false);
const connectingSeconds = ref(CONNECT_COUNTDOWN_SECONDS);
let readyTimer: number | undefined;
let countdownTimer: number | undefined;

const hasBridge = computed(() => hasJeeWebBridge());
const visible = computed(() => {
  if (!hasBridge.value) return false;
  return !ble.isReady.value || showReady.value;
});

const tone = computed(() => {
  if (ble.isReady.value) return 'ready';
  if (ble.isConnecting.value) return 'busy';
  return 'offline';
});

const label = computed(() => {
  if (ble.isReady.value) return t('ble.connected');
  if (ble.isConnecting.value) return t('ble.connecting', { seconds: connectingSeconds.value });
  if (ble.state.message === 'Connecting BLE...' || ble.state.message === 'Connecting BLE') {
    return t('ble.disconnected');
  }
  if (ble.state.message === 'BLE connected.' || ble.state.message === 'BLE connected') return t('ble.connected');
  if (ble.state.message === 'BLE disconnected.' || ble.state.message === 'PixelMug disconnected.') {
    return t('ble.disconnected');
  }
  if (ble.state.message) return ble.state.message;
  return t('ble.disconnected');
});

const canRetry = computed(() => hasBridge.value && !ble.isReady.value && !ble.isConnecting.value);

watch(
  () => ble.isReady.value,
  (ready) => {
    window.clearTimeout(readyTimer);
    if (!ready || !hasBridge.value) {
      showReady.value = false;
      return;
    }
    showReady.value = true;
    readyTimer = window.setTimeout(() => {
      showReady.value = false;
    }, READY_HIDE_MS);
  },
  { immediate: true },
);

watch(
  () => ble.isConnecting.value,
  (connecting) => {
    window.clearInterval(countdownTimer);
    if (!connecting) {
      connectingSeconds.value = CONNECT_COUNTDOWN_SECONDS;
      return;
    }
    connectingSeconds.value = CONNECT_COUNTDOWN_SECONDS;
    countdownTimer = window.setInterval(() => {
      connectingSeconds.value = Math.max(0, connectingSeconds.value - 1);
    }, 1000);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.clearTimeout(readyTimer);
  window.clearInterval(countdownTimer);
});

async function retry() {
  await ble.reconnect();
}
</script>

<template>
  <div v-if="visible" class="ble-status-banner-wrap">
    <div class="ble-status-banner" :class="tone">
      <span class="ble-status-dot" />
      <span class="ble-status-text">{{ label }}</span>
      <button v-if="canRetry" type="button" @click="retry">{{ t('ble.retry') }}</button>
    </div>
  </div>
</template>
