import type { TimerPreset, TimerStyle } from './types';

const STORAGE_KEY = 'mps-template-timer.presets.v1';

export const STYLE_OPTIONS = [
  { id: 'radar', name: 'Radar' },
  { id: 'progress', name: 'Progress Bar' },
  { id: 'spinner', name: 'Spinner' },
] as const;

export const STYLE_LABELS: Record<TimerStyle, string> = {
  radar: 'Radar',
  progress: 'Progress',
  spinner: 'Spinner',
};

export const DEFAULT_PRESETS: TimerPreset[] = [
  {
    id: 'focus',
    name: 'Focus',
    min: 25,
    sec: 0,
    style: 'radar',
  },
  {
    id: 'short-break',
    name: 'Short Break',
    min: 5,
    sec: 0,
    style: 'progress',
  },
  {
    id: 'demo',
    name: 'Demo',
    min: 0,
    sec: 30,
    style: 'radar',
  },
];

export function loadPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    return parsed.map(normalizePreset).filter(Boolean) as TimerPreset[];
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(presets: TimerPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function createPreset(): TimerPreset {
  return {
    id: String(Date.now()),
    name: 'New Timer',
    min: 10,
    sec: 0,
    style: 'radar',
  };
}

function normalizePreset(value: Partial<TimerPreset> | null) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: String(value.id || Date.now()),
    name: String(value.name || 'Timer'),
    min: clampInt(value.min, 0, 59),
    sec: clampInt(value.sec, 0, 59),
    style: normalizeStyle(value.style),
  } satisfies TimerPreset;
}

function normalizeStyle(value: unknown): TimerStyle {
  return value === 'progress' || value === 'spinner' ? value : 'radar';
}

function clampInt(value: unknown, min: number, max: number) {
  const next = Math.trunc(Number(value));
  if (!Number.isFinite(next)) return min;
  return Math.max(min, Math.min(max, next));
}

