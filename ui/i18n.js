import { ref } from 'vue';
import english from './en.js';

const storageKey = 'pixelmug-studio-language';
let initialLanguage = 'zh-CN';
try {
  if (globalThis.localStorage?.getItem(storageKey) === 'en') initialLanguage = 'en';
} catch { /* Language selection works even when browser storage is unavailable. */ }
export const language = ref(initialLanguage);

export function setLanguage(value) {
  language.value = value === 'en' ? 'en' : 'zh-CN';
  try { globalThis.localStorage?.setItem(storageKey, language.value); } catch {}
  updateDocumentLanguage();
}

export function updateDocumentLanguage() {
  if (globalThis.document) globalThis.document.documentElement.lang = language.value;
}

// Translate only explicit Studio copy. User names, source code and log payloads
// are rendered unchanged. The original Chinese copy doubles as the message key.
export function t(message, values = []) {
  const text = language.value === 'en' && Object.hasOwn(english, message) ? english[message] : message;
  return String(text).replace(/\{(\d+)\}/g, (match, index) =>
    Object.hasOwn(values, index) ? String(values[index]) : match);
}

// Only these known service messages contain dynamic values. Unknown upstream
// errors are kept verbatim, and the values are never translated.
export function serviceMessage(message) {
  const patterns = [
    [/^项目中的 (.+) 必须是独立文件夹$/, '项目中的 {0} 必须是独立文件夹'],
    [/^项目缺少必需的 (.+)\/ 文件夹$/, '项目缺少必需的 {0}/ 文件夹'],
    [/^项目包含 mpy\/ 时必须提供 mpy\/(.+)$/, '项目包含 mpy/ 时必须提供 mpy/{0}'],
    [/^冒泡接口请求失败（(.+)），请检查账号、验证码或服务配置$/, '冒泡接口请求失败（{0}），请检查账号、验证码或服务配置'],
  ];
  for (const [pattern, key] of patterns) {
    const match = String(message).match(pattern);
    if (match) return t(key, match.slice(1));
  }
  return t(message);
}
