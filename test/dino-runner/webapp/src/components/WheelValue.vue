<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  value: number;
  max: number;
}>();

const emit = defineEmits<{
  change: [value: number];
}>();

const ITEM_HEIGHT = 46;
const scroller = ref<HTMLElement | null>(null);
const options = computed(() => Array.from({ length: props.max + 1 }, (_, index) => index));
const pad = (value: number) => String(value).padStart(2, '0');
const wheelId = `wheel-${Math.random().toString(36).slice(2)}`;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;

function clamp(value: number) {
  return Math.max(0, Math.min(props.max, value));
}

function scrollToValue(value: number, behavior: ScrollBehavior = 'auto') {
  const el = scroller.value;
  if (!el) return;
  el.scrollTo({ top: clamp(value) * ITEM_HEIGHT, behavior });
}

function handleScroll() {
  const el = scroller.value;
  if (!el) return;

  const nextValue = clamp(Math.round(el.scrollTop / ITEM_HEIGHT));
  if (nextValue !== props.value) {
    emit('change', nextValue);
  }

  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => scrollToValue(nextValue, 'smooth'), 90);
}

function selectValue(value: number) {
  emit('change', value);
  nextTick(() => scrollToValue(value, 'smooth'));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectValue(clamp(props.value - 1));
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectValue(clamp(props.value + 1));
  }
}

watch(
  () => props.value,
  (value) => {
    nextTick(() => {
      const el = scroller.value;
      if (!el || Math.abs(el.scrollTop - clamp(value) * ITEM_HEIGHT) > ITEM_HEIGHT / 2) {
        scrollToValue(value);
      }
    });
  },
);

onMounted(() => {
  nextTick(() => scrollToValue(props.value));
});

onBeforeUnmount(() => {
  if (scrollTimer) clearTimeout(scrollTimer);
});
</script>

<template>
  <div class="wheel" @keydown="handleKeydown">
    <div
      ref="scroller"
      class="wheel-scroll"
      role="listbox"
      tabindex="0"
      :aria-activedescendant="`${wheelId}-${value}`"
      @scroll.passive="handleScroll"
    >
      <button
        v-for="option in options"
        :id="`${wheelId}-${option}`"
        :key="option"
        type="button"
        class="wheel-option"
        :class="{ selected: option === value }"
        role="option"
        :aria-selected="option === value"
        @click="selectValue(option)"
      >
        {{ pad(option) }}
      </button>
    </div>
  </div>
</template>
