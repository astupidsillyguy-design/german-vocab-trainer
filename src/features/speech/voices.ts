/**
 * 德语语音列表（F-086 预加载）：Chrome 等浏览器异步加载语音，第一次 getVoices() 常常是空数组，
 * 加载完成后才触发 voiceschanged —— 原版因此第一次朗读经常用错语音。
 * 应用启动时就开始读取并监听，之后朗读与设置页都直接用缓存。
 */
import { useSyncExternalStore } from 'react';
import { synthesisOf } from './synthesis';

const GERMAN_PREFIX = 'de';
const NO_VOICES: readonly SpeechSynthesisVoice[] = [];

export const isGermanVoice = (voice: SpeechSynthesisVoice): boolean =>
  voice.lang.toLowerCase().startsWith(GERMAN_PREFIX);

interface VoiceCache {
  readonly synthesis: SpeechSynthesis;
  voices: readonly SpeechSynthesisVoice[];
}

let cache: VoiceCache | null = null;
const listeners = new Set<() => void>();

/** 当前可用的德语语音；第一次调用时开始监听语音列表的变化 */
export function germanVoices(synthesis: SpeechSynthesis | null): readonly SpeechSynthesisVoice[] {
  if (synthesis === null) return NO_VOICES;
  if (cache?.synthesis !== synthesis) {
    const entry: VoiceCache = { synthesis, voices: synthesis.getVoices().filter(isGermanVoice) };
    cache = entry;
    synthesis.addEventListener('voiceschanged', () => {
      entry.voices = synthesis.getVoices().filter(isGermanVoice);
      for (const listener of listeners) listener();
    });
  }
  return cache.voices;
}

function subscribeVoices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentVoices = (): readonly SpeechSynthesisVoice[] => germanVoices(synthesisOf());

export function useGermanVoices(): readonly SpeechSynthesisVoice[] {
  return useSyncExternalStore(subscribeVoices, currentVoices, currentVoices);
}
