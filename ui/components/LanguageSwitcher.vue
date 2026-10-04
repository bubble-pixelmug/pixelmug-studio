<script setup>
import { t, language, setLanguage } from '../i18n.js';
defineProps({ id: { type: String, default: 'studio-language' } });
</script>
<template>
  <label class="language-switch" :for="id">
    <span>{{ t('语言') }}</span>
    <select :id="id" :value="language" :aria-label="t('语言')" @change="setLanguage($event.target.value)">
      <option value="zh-CN">中文</option>
      <option value="en">English</option>
    </select>
  </label>
</template>
