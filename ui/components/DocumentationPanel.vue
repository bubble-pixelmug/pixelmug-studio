<script setup>
import { ref } from 'vue';
defineProps({ url: { type: String, required: true } });
const revision = ref(0);
</script>
<template>
<section class="section-page documentation-page">
  <div class="section-intro"><div><span class="eyebrow">DOCUMENTATION</span><h2>开发文档</h2><p>开发指南、接口说明与应用示例</p></div><div class="actions"><button @click="revision++">重新加载</button><a class="docs-open" :href="url" target="_blank" rel="noopener noreferrer">在浏览器中打开 ↗</a></div></div>
  <div class="docs-container"><iframe :key="revision" :src="url" title="PixelMug 开发文档" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write"></iframe></div>
  <p class="subtle docs-help">如果文档未显示，请确认文档服务已启动，再点击“重新加载”。</p>
</section>
</template>
<style scoped>
.docs-container{height:calc(100vh - 245px);min-height:520px;border:1px solid #d5e3f6;border-radius:16px;overflow:hidden;background:white}.docs-container iframe{display:block;width:100%;height:100%;border:0}.docs-open{display:inline-block;padding:11px 14px;border:1px solid #d4dfec;border-radius:10px;color:#0758b9;text-decoration:none;background:white;font-weight:650;white-space:nowrap}.docs-help{margin:12px 0;font-size:12px}
</style>