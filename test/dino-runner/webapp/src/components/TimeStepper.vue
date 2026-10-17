<script setup lang="ts">
const props = defineProps<{
  label: string;
  value: number;
  max: number;
}>();

const emit = defineEmits<{
  change: [value: number];
}>();
</script>

<template>
  <div class="time-stepper">
    <button type="button" @click="emit('change', value >= max ? 0 : value + 1)">+</button>
    <strong>{{ props.value }}</strong>
    <span>{{ props.label }}</span>
    <button type="button" @click="emit('change', value <= 0 ? max : value - 1)">-</button>
  </div>
</template>
