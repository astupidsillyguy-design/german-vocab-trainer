/**
 * 发音偏好（F-086）：语速与首选语音。与界面语言一样属于本机偏好，保存在 localStorage，不进入词库。
 * 写入失败（隐私模式、存储被禁用）时本次会话内仍然生效。
 */
import { useSyncExternalStore } from 'react';
import { readPreference, writePreference } from '../../shared/preferences';

export const SPEECH_RATE = { min: 0.5, max: 1.5, step: 0.1, default: 0.9 } as const;

export interface SpeechPreferences {
  readonly rate: number;
  /** 首选语音的 voiceURI；null 表示自动选择 */
  readonly voiceUri: string | null;
}

const KEYS = { rate: 'speech.rate', voice: 'speech.voice' } as const;
/** 与步长一致的小数位数，避免 0.1 的累加误差（0.30000000000000004） */
const RATE_FRACTION_DIGITS = 1;

/** 限制在允许范围内并对齐到步长；无效值回到默认语速 */
export function normalizeSpeechRate(value: number): number {
  if (!Number.isFinite(value)) return SPEECH_RATE.default;
  const steps = Math.round((value - SPEECH_RATE.min) / SPEECH_RATE.step);
  const stepped = Math.min(
    SPEECH_RATE.max,
    Math.max(SPEECH_RATE.min, SPEECH_RATE.min + steps * SPEECH_RATE.step),
  );
  return Number(stepped.toFixed(RATE_FRACTION_DIGITS));
}

function parseRate(stored: string | null): number {
  return stored === null || stored.trim() === ''
    ? SPEECH_RATE.default
    : normalizeSpeechRate(Number(stored));
}

/** 写入失败的偏好：本次会话内以这里为准 */
const unsaved = new Map<string, string>();

function read(key: string): string | null {
  return unsaved.get(key) ?? readPreference(key);
}

function write(key: string, value: string): boolean {
  const saved = writePreference(key, value);
  if (saved) unsaved.delete(key);
  else unsaved.set(key, value);
  return saved;
}

interface Cached {
  readonly rate: string | null;
  readonly voice: string | null;
  readonly value: SpeechPreferences;
}

let cached: Cached | null = null;

/** 原始值不变时返回同一个对象（useSyncExternalStore 要求快照稳定） */
export function getSpeechPreferences(): SpeechPreferences {
  const rate = read(KEYS.rate);
  const voice = read(KEYS.voice);
  if (cached?.rate !== rate || cached.voice !== voice) {
    cached = {
      rate,
      voice,
      value: { rate: parseRate(rate), voiceUri: voice === null || voice === '' ? null : voice },
    };
  }
  return cached.value;
}

const listeners = new Set<() => void>();

/** 返回是否已保存到本机；未保存时本次会话内仍然生效 */
export function setSpeechPreferences(patch: Partial<SpeechPreferences>): boolean {
  let saved = true;
  if (patch.rate !== undefined) {
    saved = write(KEYS.rate, String(normalizeSpeechRate(patch.rate))) && saved;
  }
  if (patch.voiceUri !== undefined) saved = write(KEYS.voice, patch.voiceUri ?? '') && saved;
  for (const listener of listeners) listener();
  return saved;
}

/** 其他标签页修改偏好时（storage 事件）同样通知 */
export function subscribeSpeechPreferences(listener: () => void): () => void {
  listeners.add(listener);
  globalThis.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener('storage', listener);
  };
}

export function useSpeechPreferences(): SpeechPreferences {
  return useSyncExternalStore(
    subscribeSpeechPreferences,
    getSpeechPreferences,
    getSpeechPreferences,
  );
}
