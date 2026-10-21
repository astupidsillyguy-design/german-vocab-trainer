/**
 * 浏览器语音合成入口。jsdom、部分 WebView 与旧浏览器没有该接口，所有调用方都先经过这里判断。
 */
export function synthesisOf(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return typeof SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null;
}

export function isSpeechAvailable(): boolean {
  return synthesisOf() !== null;
}
