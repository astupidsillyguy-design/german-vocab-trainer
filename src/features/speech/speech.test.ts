import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSpeechPreferences,
  setSpeechPreferences,
  SPEECH_RATE,
  useSpeechPreferences,
} from './preferences';
import { pickGermanVoice, speakGerman, spokenForm, startSpeechServices } from './speech';
import { isSpeechAvailable } from './synthesis';
import { useGermanVoices } from './voices';

function voice(lang: string, localService: boolean, name = lang): SpeechSynthesisVoice {
  return { lang, localService, name, default: false, voiceURI: name };
}

class FakeUtterance extends EventTarget {
  lang = '';
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
}

class FakeSynthesis {
  speaking = false;
  pending = false;
  readonly cancel = vi.fn<() => void>();
  readonly speak = vi.fn<(utterance: FakeUtterance) => void>();
  voices: SpeechSynthesisVoice[];
  readonly #listeners = new Map<string, (() => void)[]>();

  constructor(voices: SpeechSynthesisVoice[]) {
    this.voices = voices;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  addEventListener(type: string, listener: () => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  emit(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) listener();
  }

  /** 第 index 次 speak 的参数 */
  spoken(index: number): FakeUtterance | undefined {
    return this.speak.mock.calls[index]?.[0];
  }
}

function installSynthesis(voices: SpeechSynthesisVoice[] = []): FakeSynthesis {
  const synthesis = new FakeSynthesis(voices);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', synthesis);
  return synthesis;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('spokenForm', () => {
  it('展开占位缩写并去掉格标注', () => {
    expect(spokenForm('jm. bei etw.(D.) helfen')).toBe('jemandem bei etwas helfen');
    expect(spokenForm('sich für etw. interessieren')).toBe('sich für etwas interessieren');
    expect(spokenForm('jn. anrufen')).toBe('jemanden anrufen');
  });

  it('普通单词不受影响', () => {
    expect(spokenForm('der Schrank')).toBe('der Schrank');
    expect(spokenForm('etwa')).toBe('etwa');
    expect(spokenForm('jetzt')).toBe('jetzt');
  });
});

describe('pickGermanVoice', () => {
  it('本地语音优先，其次标准德语', () => {
    const remote = voice('de-DE', false, 'remote');
    const localAustrian = voice('de-AT', true, 'local-at');
    const localGerman = voice('de-DE', true, 'local-de');
    expect(pickGermanVoice([remote, localAustrian, localGerman])).toBe(localGerman);
    expect(pickGermanVoice([remote, localAustrian])).toBe(localAustrian);
    expect(pickGermanVoice([voice('en-US', true)])).toBeNull();
  });

  it('用户选择的语音仍然可用时优先；已不可用或不是德语时自动选择', () => {
    const remote = voice('de-DE', false, 'remote');
    const local = voice('de-DE', true, 'local');
    const english = voice('en-US', true, 'english');
    expect(pickGermanVoice([remote, local], 'remote')).toBe(remote);
    expect(pickGermanVoice([remote, local], 'missing')).toBe(local);
    expect(pickGermanVoice([english, local], 'english')).toBe(local);
  });
});

describe('发音偏好', () => {
  it('默认语速，自动选择语音', () => {
    expect(getSpeechPreferences()).toEqual({ rate: SPEECH_RATE.default, voiceUri: null });
  });

  it('语速限制在范围内并对齐到步长，保存在本机', () => {
    expect(setSpeechPreferences({ rate: 1.23 })).toBe(true);
    expect(getSpeechPreferences().rate).toBe(1.2);
    setSpeechPreferences({ rate: 3 });
    expect(getSpeechPreferences().rate).toBe(SPEECH_RATE.max);
    setSpeechPreferences({ rate: 0 });
    expect(getSpeechPreferences().rate).toBe(SPEECH_RATE.min);
    expect(localStorage.getItem('gvt.pref.speech.rate')).toBe(String(SPEECH_RATE.min));
  });

  it('存储中的无效值回到默认语速', () => {
    localStorage.setItem('gvt.pref.speech.rate', 'fast');
    expect(getSpeechPreferences().rate).toBe(SPEECH_RATE.default);
    localStorage.setItem('gvt.pref.speech.rate', '');
    expect(getSpeechPreferences().rate).toBe(SPEECH_RATE.default);
  });

  it('选择语音与恢复自动选择', () => {
    setSpeechPreferences({ voiceUri: 'anna' });
    expect(getSpeechPreferences().voiceUri).toBe('anna');
    setSpeechPreferences({ voiceUri: null });
    expect(getSpeechPreferences().voiceUri).toBeNull();
  });

  it('修改后通知订阅者；值不变时快照保持同一个对象', () => {
    const { result } = renderHook(() => useSpeechPreferences());
    const before = result.current;
    expect(getSpeechPreferences()).toBe(before);
    act(() => {
      setSpeechPreferences({ rate: 1.1 });
    });
    expect(result.current.rate).toBe(1.1);
  });

  it('无法保存时返回 false，本次会话内仍然生效', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(setSpeechPreferences({ rate: 0.7 })).toBe(false);
    expect(getSpeechPreferences().rate).toBe(0.7);
    vi.restoreAllMocks();
    expect(setSpeechPreferences({ rate: SPEECH_RATE.default })).toBe(true);
    expect(getSpeechPreferences().rate).toBe(SPEECH_RATE.default);
  });
});

describe('speakGerman', () => {
  it('不支持语音合成时返回 false', () => {
    expect(isSpeechAvailable()).toBe(false);
    expect(speakGerman('der Schrank')).toBe(false);
  });

  it('按偏好的语速与语音朗读整理后的文本；只在正在朗读时打断', () => {
    const anna = voice('de-DE', true, 'anna');
    const remote = voice('de-DE', false, 'remote');
    const synthesis = installSynthesis([anna, remote]);
    setSpeechPreferences({ rate: 1.2 });

    expect(speakGerman('jm. helfen')).toBe(true);
    expect(synthesis.cancel).not.toHaveBeenCalled();
    expect(synthesis.spoken(0)).toMatchObject({
      text: 'jemandem helfen',
      lang: 'de-DE',
      rate: 1.2,
      voice: anna,
    });

    setSpeechPreferences({ voiceUri: 'remote' });
    synthesis.speaking = true;
    speakGerman('der Schrank');
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(synthesis.spoken(1)?.voice).toBe(remote);
  });

  it('语音列表异步加载：加载完成后改用德语语音，并通知设置页', () => {
    const synthesis = installSynthesis([]);
    const { result } = renderHook(() => useGermanVoices());
    expect(result.current).toEqual([]);
    speakGerman('der Schrank');
    expect(synthesis.spoken(0)).toMatchObject({ lang: 'de-DE', voice: null });

    const anna = voice('de-DE', true, 'anna');
    synthesis.voices = [voice('en-US', true), anna];
    act(() => {
      synthesis.emit('voiceschanged');
    });
    expect(result.current).toEqual([anna]);
    speakGerman('der Schrank');
    expect(synthesis.spoken(1)?.voice).toBe(anna);
  });
});

describe('startSpeechServices', () => {
  it('不支持语音合成时什么也不做', () => {
    const stop = startSpeechServices();
    window.dispatchEvent(new Event('pointerdown'));
    stop();
    expect(isSpeechAvailable()).toBe(false);
  });

  it('第一次点按时静音预热一次；预热期间朗读不打断，排在其后', () => {
    const synthesis = installSynthesis([voice('de-DE', true)]);
    const stop = startSpeechServices();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(synthesis.spoken(0)).toMatchObject({ text: '', volume: 0 });

    synthesis.speaking = true;
    speakGerman('der Schrank');
    expect(synthesis.cancel).not.toHaveBeenCalled();
    expect(synthesis.spoken(1)?.text).toBe('der Schrank');
    // 预热之后恢复正常：正在朗读时打断
    speakGerman('der Tisch');
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    stop();
  });

  it('预热结束后正常打断；清理后不再预热', () => {
    const synthesis = installSynthesis();
    startSpeechServices()();
    window.dispatchEvent(new Event('pointerdown'));
    expect(synthesis.speak).not.toHaveBeenCalled();

    const stop = startSpeechServices();
    window.dispatchEvent(new Event('keydown'));
    synthesis.spoken(0)?.dispatchEvent(new Event('end'));
    synthesis.speaking = true;
    speakGerman('der Schrank');
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    stop();
  });
});
