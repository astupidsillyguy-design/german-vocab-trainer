import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderWithProviders } from '../../test/library';
import { GlassProvider, ToastRegion, type GlassCapabilities } from '../../ui';
import { getSpeechPreferences } from '../speech';
import { SettingsPage } from './SettingsPage';

/** 支持 backdrop-filter、不支持 WebGL：“自动”落在“仅模糊” */
const BLUR_CAPABILITIES: GlassCapabilities = {
  webgl2: false,
  backdropFilter: true,
  svgBackdropFilter: false,
};

function renderSettings() {
  return renderWithProviders(
    <GlassProvider capabilities={BLUR_CAPABILITIES}>
      <SettingsPage />
      <ToastRegion />
    </GlassProvider>,
    { path: '/settings' },
  );
}

function voice(name: string, lang: string, localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name };
}

/** 模拟浏览器的语音合成 */
function stubSpeech(voices: SpeechSynthesisVoice[]) {
  const speak = vi.fn<(utterance: { readonly text: string; readonly rate: number }) => void>();
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      rate = 1;
      volume = 1;
      voice: SpeechSynthesisVoice | null = null;
      readonly text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  vi.stubGlobal('speechSynthesis', {
    speaking: false,
    pending: false,
    cancel: vi.fn(),
    speak,
    getVoices: () => voices,
    addEventListener: vi.fn(),
  });
  return speak;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage：通用', () => {
  it('切换界面语言：立即生效并保存', async () => {
    const user = userEvent.setup();
    renderSettings();
    const group = screen.getByRole('region', { name: '通用' });
    await user.click(within(group).getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(localStorage.getItem('gvt.pref.locale')).toBe('en');
    expect(screen.getByRole('region', { name: 'General' })).toBeInTheDocument();
  });

  it('选择玻璃效果档位，脚注显示实际生效的效果', async () => {
    const user = userEvent.setup();
    renderSettings();
    const group = screen.getByRole('region', { name: '通用' });
    expect(within(group).getByRole('radio', { name: '自动' })).toBeChecked();
    expect(within(group).getByText(/当前效果：仅模糊/u)).toBeInTheDocument();
    await user.click(within(group).getByRole('radio', { name: '不透明' }));
    expect(within(group).getByText(/当前效果：不透明/u)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-glass-tier', 'opaque');
    await expectNoAxeViolations();
  });
});

describe('SettingsPage：发音', () => {
  it('浏览器不支持语音合成时说明原因', () => {
    renderSettings();
    const group = screen.getByRole('region', { name: '发音' });
    expect(within(group).getByText('此浏览器不支持语音朗读')).toBeInTheDocument();
  });

  it('调节语速（键盘），选择语音并试听', async () => {
    const user = userEvent.setup();
    const speak = stubSpeech([voice('Anna', 'de-DE'), voice('Samantha', 'en-US')]);
    renderSettings();
    const group = screen.getByRole('region', { name: '发音' });

    const slider = within(group).getByRole('slider', { name: '语速' });
    expect(within(group).getByText('0.9×')).toBeInTheDocument();
    act(() => {
      slider.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(getSpeechPreferences().rate).toBe(1);
    expect(within(group).getByText('1.0×')).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: '语音：自动' }));
    const menu = await screen.findByRole('menu');
    // 只列出德语语音
    expect(within(menu).queryByText(/Samantha/u)).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Anna（de-DE）' }));
    expect(getSpeechPreferences().voiceUri).toBe('Anna');
    expect(within(group).getByRole('button', { name: '语音：Anna' })).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: '试听' }));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ rate: 1 }));
    await expectNoAxeViolations();
  });

  it('没有德语语音时说明', () => {
    stubSpeech([voice('Samantha', 'en-US')]);
    renderSettings();
    const group = screen.getByRole('region', { name: '发音' });
    expect(within(group).getByText('没有德语语音')).toBeInTheDocument();
  });
});

describe('SettingsPage：关于', () => {
  it('显示版本号', () => {
    renderSettings();
    const group = screen.getByRole('region', { name: '关于' });
    expect(within(group).getByText(`版本 ${__APP_VERSION__}`)).toBeInTheDocument();
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/u);
  });
});
