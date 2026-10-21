import { describe, expect, it } from 'vitest';
import {
  CATEGORY_IDS,
  TARGET_SCORE,
  formatLines,
  hasFailure,
  judge,
  lighthouseArgs,
  parseScores,
  type Scores,
} from './lighthouse-report';

const PERFECT: Scores = { performance: 100, accessibility: 100, 'best-practices': 100, seo: 100 };

function report(scores: Record<string, number | null>): unknown {
  return {
    categories: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { score }])),
  };
}

describe('parseScores', () => {
  it('把 0–1 的分数换算成 0–100 的整数', () => {
    expect(
      parseScores(
        report({ performance: 0.894, accessibility: 1, 'best-practices': 0.955, seo: 0.9 }),
      ),
    ).toEqual({ performance: 89, accessibility: 100, 'best-practices': 96, seo: 90 });
  });

  it('报告出错（分数为空或缺少类别）时抛出错误，不会被当成 0 分', () => {
    expect(() =>
      parseScores(report({ performance: null, accessibility: 1, 'best-practices': 1, seo: 1 })),
    ).toThrow('performance');
    expect(() => parseScores(report({ performance: 1 }))).toThrow('accessibility');
    expect(() => parseScores({})).toThrow('categories');
    expect(() => parseScores(null)).toThrow('categories');
  });
});

describe('judge', () => {
  it('全部达到目标时都是 pass', () => {
    expect(judge('mobile', PERFECT).every((line) => line.status === 'pass')).toBe(true);
  });

  it('移动端恰好达到目标时通过', () => {
    const lines = judge('mobile', { ...PERFECT, performance: TARGET_SCORE });
    expect(lines.find((line) => line.category === 'performance')?.status).toBe('pass');
    expect(hasFailure(lines)).toBe(false);
  });

  it('移动端低于目标也失败，不降低验收标准', () => {
    expect(hasFailure(judge('mobile', { ...PERFECT, performance: TARGET_SCORE - 1 }))).toBe(true);
  });

  it('桌面端与其他类别没有宽限：低于目标就失败', () => {
    const below = TARGET_SCORE - 1;
    expect(hasFailure(judge('desktop', { ...PERFECT, performance: below }))).toBe(true);
    for (const category of CATEGORY_IDS.filter((id) => id !== 'performance')) {
      expect(hasFailure(judge('mobile', { ...PERFECT, [category]: below }))).toBe(true);
    }
  });
});

describe('formatLines', () => {
  it('每个类别一行，带通过标记', () => {
    const text = formatLines('desktop', judge('desktop', { ...PERFECT, seo: 90 }));
    expect(text.split('\n')).toHaveLength(CATEGORY_IDS.length + 1);
    expect(text).toContain('✓ performance');
    expect(text).toContain('✗ seo');
  });
});

describe('lighthouseArgs', () => {
  const base = {
    url: 'http://localhost:1234/',
    outputPath: '/tmp/report.json',
    extraChromeFlags: '',
  };

  it('桌面端加 --preset=desktop，移动端使用默认的移动设备模拟', () => {
    expect(lighthouseArgs({ ...base, formFactor: 'desktop' })).toContain('--preset=desktop');
    expect(lighthouseArgs({ ...base, formFactor: 'mobile' })).not.toContain('--preset=desktop');
  });

  it('只测四个类别，并总是使用无界面模式', () => {
    const args = lighthouseArgs({ ...base, formFactor: 'mobile' });
    expect(args).toContain('--only-categories=performance,accessibility,best-practices,seo');
    expect(args).toContain('--chrome-flags=--headless=new');
  });

  it('额外的 Chrome 参数追加在后面', () => {
    const args = lighthouseArgs({
      ...base,
      formFactor: 'mobile',
      extraChromeFlags: '--no-sandbox',
    });
    expect(args).toContain('--chrome-flags=--headless=new --no-sandbox');
  });
});
