<script setup lang="ts">
import type { AppStatus } from '../types';

defineProps<{
  status: AppStatus;
  text: string;
}>();
</script>

<template>
  <div class="status-toast" :class="{ error: status === 'error' }">{{ text }}</div>
</template>
