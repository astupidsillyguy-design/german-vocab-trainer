/**
 * 发音：德语语音合成（F-086）。
 */
export {
  getSpeechPreferences,
  normalizeSpeechRate,
  setSpeechPreferences,
  SPEECH_RATE,
  useSpeechPreferences,
  type SpeechPreferences,
} from './preferences';
export { pickGermanVoice, speakGerman, spokenForm, startSpeechServices } from './speech';
export { isSpeechAvailable } from './synthesis';
export { useGermanVoices } from './voices';
