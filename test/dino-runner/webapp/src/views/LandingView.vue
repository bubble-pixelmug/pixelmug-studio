<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { LOADING_IMAGE } from '../assets';
import { t } from '../i18n';
import { useDinoRunner } from '../state/dinoRunner';

type LandingStep = 'open' | 'enter';

const router = useRouter();
const store = useDinoRunner();
const step = ref<LandingStep>('open');

async function handleOpen() {
  const ok = await store.openOnDevice();
  step.value = ok ? 'enter' : 'open';
  if (ok) void store.connectDevice();
}

async function handleEnter() {
  if (!store.canEnter.value) {
    await handleOpen();
    return;
  }
  router.push('/game');
}
</script>

<template>
  <main class="landing dino-landing" :class="step">
    <div class="landing-visual" aria-hidden="true">
      <div class="loading-device dino-device">
        <img :src="LOADING_IMAGE" alt="" />
      </div>
    </div>

    <div class="landing-copy">
      <h1>{{ t('app.title') }}</h1>
      <p>{{ t('landing.subtitle') }}</p>
    </div>

    <div class="landing-actions">
      <button class="landing-primary" :disabled="step === 'open' && store.busy.value" @click="step === 'enter' ? handleEnter() : handleOpen()">
        {{ step === 'enter' ? t('landing.enter') : store.openButtonLabel.value }}
      </button>
      <p
        v-if="step === 'enter' || store.statusText.value"
        :class="step === 'open' && store.state.status === 'error' ? 'landing-error' : 'landing-status'"
      >
        {{ step === 'enter' ? t('status.launchReady') : store.statusText.value }}
      </p>
    </div>
  </main>
</template>
