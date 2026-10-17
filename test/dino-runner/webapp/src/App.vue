<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import BleStatusBanner from './template/components/BleStatusBanner.vue';
import { useDinoRunner } from './state/dinoRunner';

const route = useRoute();
const store = useDinoRunner();
const showBleStatus = computed(() => route.name !== 'landing');
let cleanup: () => void = () => undefined;

watch(
  () => route.name,
  () => {
    cleanup();
    cleanup = () => undefined;
    if (showBleStatus.value) {
      cleanup = store.bindBleState();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <BleStatusBanner v-if="showBleStatus" />
  <RouterView />
</template>
