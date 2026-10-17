<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const active = computed(() => (route.name === 'quick' ? 'quick' : 'all'));
</script>

<template>
  <nav class="bottom-tabs">
    <button :class="{ active: active === 'all' }" @click="router.push('/timers')">
      <span class="tab-icon">==</span>
      ALL
    </button>
    <button :class="{ active: active === 'quick' }" @click="router.push('/quick')">
      <span class="tab-icon">/</span>
      QUICK
    </button>
  </nav>
</template>
