/**
 * 德语发音（F-086）：预加载并缓存德语语音、优先本地语音、首次手势预热、只在需要时打断；语速与语音可调。
 */
import { getSpeechPreferences } from './preferences';
import { synthesisOf } from './synthesis';
import { germanVoices, isGermanVoice } from './voices';

const GERMAN_LANG = 'de-DE';

/** 词表里的占位缩写读出来很怪：展开成完整的词；格标注（D.）（A.）不读 */
const ABBREVIATIONS: readonly (readonly [RegExp, string])[] = [
  [/\bjmdm\.?(?=\s|$|\()/giu, 'jemandem'],
  [/\bjmdn\.?(?=\s|$|\()/giu, 'jemanden'],
  [/\bjm\.?(?=\s|$|\()/giu, 'jemandem'],
  [/\bjn\.?(?=\s|$|\()/giu, 'jemanden'],
  [/\bjds\.?(?=\s|$|\()/giu, 'jemandes'],
  [/\betw\.?(?=\s|$|\()/giu, 'etwas'],
];
const CASE_MARKER = /\s*\((?:D|A|G|N|Dat|Akk|Gen|Nom)\.?\)/giu;

/** 朗读用的文本：展开占位缩写、去掉格标注 */
export function spokenForm(text: string): string {
  let output = text.replace(CASE_MARKER, ' ');
  for (const [pattern, replacement] of ABBREVIATIONS) output = output.replace(pattern, replacement);
  return output.replace(/\s+/gu, ' ').trim();
}

/** 用户选择的语音（仍然可用时）优先；否则本地语音优先（离线可用、无网络延迟），其次标准德语，最后任何德语变体 */
export function pickGermanVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferredUri: string | null = null,
): SpeechSynthesisVoice | null {
  const german = voices.filter(isGermanVoice);
  const preferred = german.find((voice) => voice.voiceURI === preferredUri);
  if (preferred !== undefined) return preferred;
  const score = (voice: SpeechSynthesisVoice): number =>
    (voice.localService ? 2 : 0) + (voice.lang === GERMAN_LANG ? 1 : 0);
  return german.reduce<SpeechSynthesisVoice | null>(
    (best, voice) => (best === null || score(voice) > score(best) ? voice : best),
    null,
  );
}

/** 预热朗读没有结束事件时（部分引擎对空文本不触发），最长等待这么久后视为结束 */
const WARM_UP_TIMEOUT_MS = 2000;
const GESTURE_EVENTS = ['pointerdown', 'keydown'] as const;

/** 正在进行的预热朗读 */
let warmingUp = false;

/**
 * 预热：在第一次用户手势中朗读一段静音的空文本。iOS 只允许在手势中启动语音合成，
 * 其他浏览器第一次朗读要先初始化引擎；提前完成这一步，第一次点“发音”时就能立即出声。
 */
function warmUp(synthesis: SpeechSynthesis): void {
  if (synthesis.speaking || synthesis.pending) return;
  const utterance = new SpeechSynthesisUtterance('');
  utterance.volume = 0;
  utterance.lang = GERMAN_LANG;
  warmingUp = true;
  const finish = (): void => {
    warmingUp = false;
  };
  utterance.addEventListener('end', finish);
  utterance.addEventListener('error', finish);
  setTimeout(finish, WARM_UP_TIMEOUT_MS);
  synthesis.speak(utterance);
}

/** 应用启动时调用：预加载语音列表，并在第一次点按或按键时预热。返回清理函数 */
export function startSpeechServices(target: EventTarget = window): () => void {
  const synthesis = synthesisOf();
  if (synthesis === null) return () => undefined;
  germanVoices(synthesis);
  const stop = (): void => {
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, onGesture, true);
  };
  function onGesture(): void {
    stop();
    if (synthesis !== null) warmUp(synthesis);
  }
  for (const type of GESTURE_EVENTS) target.addEventListener(type, onGesture, true);
  return stop;
}

/** 按当前偏好（语速、语音）朗读德语文本；不支持语音合成时返回 false */
export function speakGerman(text: string): boolean {
  const synthesis = synthesisOf();
  if (synthesis === null) return false;
  const { rate, voiceUri } = getSpeechPreferences();
  const utterance = new SpeechSynthesisUtterance(spokenForm(text));
  const voice = pickGermanVoice(germanVoices(synthesis), voiceUri);
  utterance.lang = voice?.lang ?? GERMAN_LANG;
  if (voice !== null) utterance.voice = voice;
  utterance.rate = rate;
  // 只在确实有内容在读时才打断：无条件 cancel 会让部分浏览器吞掉紧随其后的 speak。
  // 预热的静音朗读不打断，新内容排在它后面
  if (!warmingUp && (synthesis.speaking || synthesis.pending)) synthesis.cancel();
  warmingUp = false;
  synthesis.speak(utterance);
  return true;
}
