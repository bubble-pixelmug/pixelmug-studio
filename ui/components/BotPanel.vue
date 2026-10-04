<script setup>
import { t, serviceMessage } from '../i18n.js';
import { reactive } from 'vue';
import { deviceIconFor } from '../deviceIcon.js';
import bubbleIcon from '../assets/bubble-transparent.png';
defineProps({ bots:{type:Array,default:()=>[]}, error:String, busy:Boolean, runningBotId:String });
const emit=defineEmits(['refresh','save']);
const drafts=reactive({});
const failedImages=reactive({});
function save(bot){
  const token=(drafts[bot.key]||'').trim();
  if(!token) return;
  emit('save',{botId:bot.id,token});
  drafts[bot.key]='';
}
</script>
<template>
  <section class="card bot-panel">
    <div class="section-heading"><div><span class="eyebrow">MY BOTS</span><h2>{{ t('我的 Bot ') }}<span class="count">{{ bots.length }}</span></h2></div><button :disabled="busy" @click="$emit('refresh')">{{ t('刷新') }}</button></div>
    <p class="subtle">{{ t('如果你还没有冒泡 bot，请到冒泡 App 搜索 BubbleBot，并执行 /newbot 命令创建一个你的 bot。如果忘记了你曾经申请的 bot token，请在 BubbleBot 中执行 /mybots 命令查询。你在设置处填写的 bot token 仅保留在本次 Studio 运行进程中，不会保存到本地。退出账号或关闭 Studio 后需重新填写。') }}</p>
    <p v-if="error" role="alert">{{ serviceMessage(error) }}</p>
    <div class="bot-grid">
      <article v-for="bot in bots" :key="bot.key" class="account-bot-card">
        <div class="bot-avatar-column">
          <img class="bot-avatar" :src="!failedImages[bot.avatar] && deviceIconFor(bot).src || bubbleIcon" alt="" @error="failedImages[bot.avatar]=true">
          <span v-if="bot.id && runningBotId===bot.id" class="bot-in-use" role="status">{{ t('当前正在使用') }}</span>
        </div>
        <div class="bot-card-content">
          <h3>{{ bot.name||t('未命名 Bot') }}</h3>
          <p class="subtle">Bot ID：{{ bot.id||t('未提供') }}</p>
          <p class="bot-description">{{ bot.description||t('暂无介绍') }}</p>
          <form @submit.prevent="save(bot)">
            <label :for="'token-'+bot.key">Bot token <span class="subtle">{{ bot.hasToken?t('已设置'):t('未设置') }}</span></label>
            <div class="inline"><input :id="'token-'+bot.key" v-model="drafts[bot.key]" type="password" autocomplete="off" :disabled="busy||!bot.id||runningBotId===bot.id" :placeholder="bot.hasToken?t('已设置，填写可替换'):t('输入 Bot token')"><button type="submit" :disabled="busy||!bot.id||runningBotId===bot.id||!drafts[bot.key]?.trim()">{{ t('设置') }}</button></div>
            <small v-if="!bot.id">{{ t('此 Bot 缺少 ID，暂时无法选择。') }}</small><small v-else-if="runningBotId===bot.id">{{ t('停止智能体后可修改 token。') }}</small>
          </form>
        </div>
      </article>
    </div>
    <p v-if="!bots.length&&!error" class="empty">{{ t('暂无 Bot，请在冒泡 App 中申请后刷新。') }}</p>
  </section>
</template>
<style scoped>
.bot-panel{margin-top:24px}.bot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,390px),1fr));gap:18px;margin-top:20px}.account-bot-card{display:flex;align-items:flex-start;gap:20px;padding:24px;border:1px solid #d5e3f6;border-radius:22px;background:#f7faff;min-width:0}.bot-avatar-column{display:flex;flex-direction:column;align-items:center;gap:10px;width:96px;flex-shrink:0}.bot-in-use{padding:4px 7px;border-radius:999px;background:#e7f7ed;color:#16834a;font-size:12px;font-weight:600;line-height:1.5;text-align:center}.bot-avatar{width:96px;height:96px;object-fit:cover;border-radius:20px;background:#eaf5ff;flex-shrink:0}.bot-card-content{flex:1;min-width:0}.bot-card-content h3{margin:0 0 8px;font-size:20px}.bot-card-content p{margin:6px 0;overflow-wrap:anywhere}.bot-description{color:#526b89;white-space:pre-wrap}.bot-card-content form{margin-top:16px}.bot-card-content label{font-size:15px}.bot-card-content .inline{margin-top:8px}.bot-card-content input{min-width:0;width:100%}.bot-card-content button{flex-shrink:0}.bot-card-content small{display:block;margin-top:8px;color:#7389a5}@media(max-width:600px){.account-bot-card{padding:16px;gap:12px}.bot-avatar-column{width:64px}.bot-in-use{font-size:11px;padding:4px}.bot-avatar{width:64px;height:64px}}
</style>
