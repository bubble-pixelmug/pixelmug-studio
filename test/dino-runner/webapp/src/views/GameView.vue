<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { LOADING_IMAGE } from '../assets';
import { t } from '../i18n';
import { useDinoRunner } from '../state/dinoRunner';

const store = useDinoRunner();
const showStartText = computed(() => store.state.gameState === 'gameover');
const isPressed = ref(false);
let pressTimer: number | undefined;
let clickSuppressTimer: number | undefined;
let pointerJumped = false;

function clearPressTimer() {
  if (pressTimer === undefined) return;
  window.clearTimeout(pressTimer);
  pressTimer = undefined;
}

function clearClickSuppressTimer() {
  if (clickSuppressTimer === undefined) return;
  window.clearTimeout(clickSuppressTimer);
  clickSuppressTimer = undefined;
}

function suppressNextClick() {
  clearClickSuppressTimer();
  pointerJumped = true;
  clickSuppressTimer = window.setTimeout(() => {
    pointerJumped = false;
    clickSuppressTimer = undefined;
  }, 600);
}

function setPressed(value: boolean) {
  if (!store.canSend.value) return;
  clearPressTimer();
  isPressed.value = value;
}

function releasePressed(delay = 0) {
  clearPressTimer();
  pressTimer = window.setTimeout(() => {
    isPressed.value = false;
    pressTimer = undefined;
  }, delay);
}

function sendJump() {
  void store.jump();
}

function handlePointerDown() {
  if (!store.canSend.value) return;
  suppressNextClick();
  setPressed(true);
  sendJump();
}

function handleClick() {
  if (!store.canSend.value) return;
  if (pointerJumped) {
    pointerJumped = false;
    clearClickSuppressTimer();
    return;
  }
  setPressed(true);
  releasePressed(40);
  sendJump();
}

onBeforeUnmount(() => {
  clearPressTimer();
  clearClickSuppressTimer();
});
</script>

<template>
  <main class="game-page">
    <section class="jump-hero">
      <button
        class="jump-icon-button"
        :class="{ 'is-text': showStartText, 'is-pressed': isPressed }"
        :disabled="!store.canSend.value"
        :aria-label="showStartText ? 'Press to Start' : t('game.jump')"
        @pointerdown="handlePointerDown"
        @pointerup="releasePressed()"
        @pointercancel="releasePressed(0)"
        @pointerleave="releasePressed(0)"
        @click="handleClick"
      >
        <span v-if="showStartText" class="start-words">
          <span>Press</span>
          <span>to</span>
          <span>Start</span>
        </span>
        <img v-else :src="LOADING_IMAGE" alt="" />
      </button>
    </section>

    <section class="score-strip game-score-strip">
      <div>
        <span>{{ t('game.last') }}</span>
        <strong class="last-score-value">{{ store.state.lastScore }}</strong>
      </div>
      <div>
        <span>{{ t('game.best') }}</span>
        <strong class="best-score-value">{{ store.state.bestScore }}</strong>
      </div>
    </section>
  </main>
</template>
