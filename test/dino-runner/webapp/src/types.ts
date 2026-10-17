export type DeviceInfo = {
  name?: string;
  talId?: string;
  compatible?: string[];
  deviceTalId?: string;
  slot?: string | number;
  slotId?: string;
  deviceId?: string;
  online?: boolean;
  raw?: unknown;
};

export type DinoDifficulty = 'easy' | 'normal' | 'hard';

export type DinoGameState = 'ready' | 'running' | 'paused' | 'gameover' | 'unknown';

export type TimerStyle = 'radar' | 'progress' | 'spinner';

export type TimerPreset = {
  id: string;
  name: string;
  min: number;
  sec: number;
  style: TimerStyle;
};

export type AppStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'installing'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'error';

