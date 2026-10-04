import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import english from '../ui/en.js';
import { language, setLanguage, t, serviceMessage } from '../ui/i18n.js';

function browserGlobals(storage, run) {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:storage });
  Object.defineProperty(globalThis, 'document', { configurable:true, value:{ documentElement:{ lang:'' } } });
  return Promise.resolve().then(run).finally(() => {
    if(oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
    if(oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
    language.value = 'zh-CN';
  });
}

test('language defaults to original Chinese and preserves every message verbatim', () => {
  assert.equal(language.value, 'zh-CN');
  for(const key of Object.keys(english)) assert.equal(t(key), key);
  assert.equal(t('未知服务消息'), '未知服务消息');
});

test('language selection persists, restores, updates HTML lang, and rejects unsupported locales', async () => {
  const saved = new Map();
  await browserGlobals({getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}, async () => {
    setLanguage('en');
    assert.equal(t('退出登录'), 'Sign out');
    assert.equal(document.documentElement.lang, 'en');
    const restored = await import('../ui/i18n.js?saved-language');
    assert.equal(restored.language.value, 'en');
    setLanguage('zh-CN');
    assert.equal(document.documentElement.lang, 'zh-CN');
    assert.equal(t('退出登录'), '退出登录');
    setLanguage('unsupported');
    assert.equal(language.value, 'zh-CN');
    assert.equal(saved.get('pixelmug-studio-language'), 'zh-CN');
  });
});

test('language switching works with unavailable browser storage', async () => {
  await browserGlobals({getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}, async () => {
    const fresh = await import('../ui/i18n.js?blocked-storage');
    assert.equal(fresh.language.value, 'zh-CN');
    assert.doesNotThrow(()=>fresh.setLanguage('en'));
    assert.equal(fresh.t('开发文档'), 'Documentation');
  });
});

test('parameterized copy preserves dynamic values and unknown service errors', () => {
  language.value = 'en';
  const name = '中文设备 $& {1}';
  assert.equal(t('Wi-Fi：{0} · IP：{1}', [name,'192.168.1.2']), 'Wi-Fi: '+name+' · IP: 192.168.1.2');
  assert.equal(serviceMessage('项目缺少必需的 bot/ 文件夹'), 'The project is missing the required bot/ folder');
  assert.equal(serviceMessage('冒泡接口请求失败（401），请检查账号、验证码或服务配置'), 'Bubble API request failed (401). Check the account, verification code, or service configuration');
  assert.equal(serviceMessage('upstream error: 自定义'), 'upstream error: 自定义');
  language.value = 'zh-CN';
  assert.equal(serviceMessage('项目缺少必需的 bot/ 文件夹'), '项目缺少必需的 bot/ 文件夹');
});

test('all explicit interface translation keys have English copy', async () => {
  const components = await readdir(new URL('../ui/components/', import.meta.url));
  const paths = ['App.vue', ...components.filter(name=>name.endsWith('.vue')).map(name=>'components/'+name)];
  for(const path of paths) {
    const source = await readFile(new URL('../ui/'+path, import.meta.url),'utf8');
    for(const match of source.matchAll(/\bt\('([^']*)'/g)) {
      assert.ok(Object.hasOwn(english,match[1]), `${path}: missing English for ${match[1]}`);
    }
  }
});
