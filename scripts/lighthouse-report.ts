/**
 * Lighthouse 结果的解析与门槛判断（纯函数，便于测试；运行 Lighthouse 的部分在 lighthouse.ts）。
 */

export const CATEGORY_IDS = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const FORM_FACTORS = ['mobile', 'desktop'] as const;
export type FormFactor = (typeof FORM_FACTORS)[number];

/** 0–100 的整数分 */
export type Scores = Readonly<Record<CategoryId, number>>;

/** 项目的质量目标：每一项都不低于这个分数 */
export const TARGET_SCORE = 95;

const SCORE_SCALE = 100;

const FLOORS: Readonly<Record<FormFactor, Scores>> = {
  mobile: {
    performance: TARGET_SCORE,
    accessibility: TARGET_SCORE,
    'best-practices': TARGET_SCORE,
    seo: TARGET_SCORE,
  },
  desktop: {
    performance: TARGET_SCORE,
    accessibility: TARGET_SCORE,
    'best-practices': TARGET_SCORE,
    seo: TARGET_SCORE,
  },
};

/** 从 Lighthouse 的 JSON 报告取出四个类别的分数；报告出错（没有分数）时抛出错误 */
export function parseScores(report: unknown): Scores {
  if (typeof report !== 'object' || report === null || !('categories' in report)) {
    throw new Error('不是 Lighthouse 报告：缺少 categories');
  }
  const { categories } = report as { readonly categories: Readonly<Record<string, unknown>> };
  const scores = {} as Record<CategoryId, number>;
  for (const id of CATEGORY_IDS) {
    const category = categories[id];
    const score =
      typeof category === 'object' && category !== null && 'score' in category
        ? category.score
        : undefined;
    if (typeof score !== 'number') throw new Error(`Lighthouse 没有给出“${id}”的分数`);
    scores[id] = Math.round(score * SCORE_SCALE);
  }
  return scores;
}

export interface ScoreLine {
  readonly category: CategoryId;
  readonly score: number;
  readonly floor: number;
  /** 所有设备、所有类别都使用同一验收目标，不因实测结果降低门槛。 */
  readonly status: 'pass' | 'fail';
}

export function judge(formFactor: FormFactor, scores: Scores): ScoreLine[] {
  return CATEGORY_IDS.map((category) => {
    const score = scores[category];
    const floor = FLOORS[formFactor][category];
    const status: ScoreLine['status'] = score >= floor ? 'pass' : 'fail';
    return { category, score, floor, status };
  });
}

const STATUS_MARK: Readonly<Record<ScoreLine['status'], string>> = {
  pass: '✓',
  fail: '✗',
};

export function formatLines(formFactor: FormFactor, lines: readonly ScoreLine[]): string {
  const rows = lines.map(
    ({ category, score, status }) =>
      `  ${STATUS_MARK[status]} ${category.padEnd('best-practices'.length)} ${String(score).padStart(3)}`,
  );
  return [formFactor, ...rows].join('\n');
}

export function hasFailure(lines: readonly ScoreLine[]): boolean {
  return lines.some((line) => line.status === 'fail');
}

/** 固定版本：结果可复现，且不增加项目依赖（首次运行由 npx 下载） */
export const LIGHTHOUSE_PACKAGE = 'lighthouse@13.5.0';

/** 传给 Lighthouse 的命令行参数（不含包名） */
export function lighthouseArgs(options: {
  readonly url: string;
  readonly formFactor: FormFactor;
  readonly outputPath: string;
  /** 额外的 Chrome 启动参数，例如容器里需要 `--no-sandbox --disable-dev-shm-usage` */
  readonly extraChromeFlags: string;
}): string[] {
  const chromeFlags = `--headless=new ${options.extraChromeFlags}`.trim();
  return [
    options.url,
    '--output=json',
    `--output-path=${options.outputPath}`,
    '--quiet',
    `--only-categories=${CATEGORY_IDS.join(',')}`,
    ...(options.formFactor === 'desktop' ? ['--preset=desktop'] : []),
    `--chrome-flags=${chromeFlags}`,
  ];
}
