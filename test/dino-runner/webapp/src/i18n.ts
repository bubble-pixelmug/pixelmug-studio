import { computed, reactive } from 'vue';

export type AppLocale = 'zh-CN' | 'en-US';

type MessageKey =
  | 'app.title'
  | 'landing.subtitle'
  | 'landing.opening'
  | 'landing.enter'
  | 'landing.retry'
  | 'landing.install'
  | 'status.browserMock'
  | 'status.findingDevice'
  | 'status.deviceReady'
  | 'status.deviceMissing'
  | 'status.launching'
  | 'status.preparing'
  | 'status.switching'
  | 'status.launchReady'
  | 'status.connectingBle'
  | 'status.bleConnected'
  | 'status.commandSent'
  | 'status.unknownError'
  | 'game.last'
  | 'game.best'
  | 'game.status'
  | 'game.difficulty'
  | 'game.easy'
  | 'game.normal'
  | 'game.hard'
  | 'game.jump'
  | 'game.restart'
  | 'game.pause'
  | 'game.resume'
  | 'game.state.running'
  | 'game.state.paused'
  | 'game.state.gameover'
  | 'game.state.ready'
  | 'game.state.unknown'
  | 'ble.connected'
  | 'ble.connecting'
  | 'ble.disconnected'
  | 'ble.retry';

const messages: Record<AppLocale, Record<MessageKey, string>> = {
  'zh-CN': {
    'app.title': '恐龙跑酷',
    'landing.subtitle': '控制 PixelMug 上的小恐龙跳过障碍，灵感来自 chrome://dino。',
    'landing.opening': '正在打开……',
    'landing.enter': '进入游戏',
    'landing.retry': '重试',
    'landing.install': '在 PixelMug 上安装',
    'status.browserMock': '浏览器模拟模式。',
    'status.findingDevice': '正在查找 PixelMug……',
    'status.deviceReady': 'PixelMug 已就绪。',
    'status.deviceMissing': '还没有绑定 PixelMug。',
    'status.launching': '正在启动恐龙跑酷……',
    'status.preparing': '正在准备应用……',
    'status.switching': '正在切换应用……',
    'status.launchReady': '恐龙已经跑起来了。',
    'status.connectingBle': '正在连接 BLE……',
    'status.bleConnected': 'BLE 已连接。',
    'status.commandSent': '命令已发送。',
    'status.unknownError': '未知错误',
    'game.last': '上次',
    'game.best': '最高分',
    'game.status': '状态',
    'game.difficulty': '难度',
    'game.easy': '简单',
    'game.normal': '普通',
    'game.hard': '困难',
    'game.jump': '跳跃',
    'game.restart': '重新开始',
    'game.pause': '暂停',
    'game.resume': '继续',
    'game.state.running': '运行中',
    'game.state.paused': '已暂停',
    'game.state.gameover': '游戏结束',
    'game.state.ready': '准备就绪',
    'game.state.unknown': '等待连接',
    'ble.connected': 'BLE 已连接',
    'ble.connecting': '正在连接 BLE（{seconds} 秒）',
    'ble.disconnected': 'BLE 未连接',
    'ble.retry': '重试',
  },
  'en-US': {
    'app.title': 'Dino Runner',
    'landing.subtitle': 'Control a tiny dino on PixelMug and jump over obstacles, inspired by chrome://dino.',
    'landing.opening': 'Opening...',
    'landing.enter': 'Enter game',
    'landing.retry': 'Retry',
    'landing.install': 'Install on PixelMug',
    'status.browserMock': 'Browser mock mode.',
    'status.findingDevice': 'Finding PixelMug...',
    'status.deviceReady': 'PixelMug is ready.',
    'status.deviceMissing': 'No PixelMug is bound yet.',
    'status.launching': 'Launching Dino Runner...',
    'status.preparing': 'Preparing app...',
    'status.switching': 'Switching app...',
    'status.launchReady': 'The dino is running.',
    'status.connectingBle': 'Connecting BLE...',
    'status.bleConnected': 'BLE connected.',
    'status.commandSent': 'Command sent.',
    'status.unknownError': 'Unknown error',
    'game.last': 'Last',
    'game.best': 'Best',
    'game.status': 'Status',
    'game.difficulty': 'Difficulty',
    'game.easy': 'Easy',
    'game.normal': 'Normal',
    'game.hard': 'Hard',
    'game.jump': 'Jump',
    'game.restart': 'Restart',
    'game.pause': 'Pause',
    'game.resume': 'Resume',
    'game.state.running': 'Running',
    'game.state.paused': 'Paused',
    'game.state.gameover': 'Game over',
    'game.state.ready': 'Ready',
    'game.state.unknown': 'Waiting',
    'ble.connected': 'BLE connected',
    'ble.connecting': 'Connecting BLE ({seconds}s)',
    'ble.disconnected': 'BLE disconnected',
    'ble.retry': 'Retry',
  },
};

const state = reactive({
  locale: detectLocale(),
});

export const currentLocale = computed(() => state.locale);

export function setLocale(locale: string | null | undefined) {
  state.locale = normalizeLocale(locale);
}

export function t(key: MessageKey, params: Record<string, string | number> = {}) {
  const template = messages[state.locale][key] || messages['en-US'][key] || key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}

function detectLocale(): AppLocale {
  return (globalThis as { JeeWeb?: { Language?: string } }).JeeWeb?.Language === 'zh-CN'
    ? 'zh-CN'
    : 'en-US';
}

function normalizeLocale(value: string | null | undefined): AppLocale {
  return value === 'zh-CN' ? 'zh-CN' : 'en-US';
}

