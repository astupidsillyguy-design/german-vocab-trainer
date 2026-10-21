import { cssVarName } from '../design/build/naming';
import { contrastRatio } from '../design/math/contrast';
import type { SemanticColorScheme } from '../design/tokens';

export interface ColorSwatch {
  readonly path: string;
  readonly value: string;
  readonly cssVar: string;
  /** 用作文字色时与主背景的对比度；作为实心底色时与其上白字的对比度；其余为 null */
  readonly contrast: number | null;
}

interface ColorLeaf {
  readonly path: readonly string[];
  readonly value: string;
}

function walk(tree: object, prefix: readonly string[]): ColorLeaf[] {
  const entries: [string, unknown][] = Object.entries(tree);
  return entries.flatMap(([key, value]): ColorLeaf[] => {
    const path = [...prefix, key];
    if (typeof value === 'string') return [{ path, value }];
    if (typeof value === 'object' && value !== null) return walk(value, path);
    return [];
  });
}

const TEXT_ROLES = new Set(['text', 'focusRing']);
const SOLID_ROLES = new Set(['solid', 'base', 'pressed']);

/** 把语义色方案展开为色板，并按用途计算 WCAG 对比度。 */
export function colorSwatches(scheme: SemanticColorScheme): ColorSwatch[] {
  const background = scheme.background.primary;
  const onSolid = scheme.label.onSolid;

  return walk(scheme, []).map(({ path, value }) => {
    const [group, role = ''] = path;
    let contrast: number | null = null;
    if (group === 'label' && role !== 'onSolid') contrast = contrastRatio(value, background);
    else if (TEXT_ROLES.has(role) || group === 'focusRing')
      contrast = contrastRatio(value, background);
    else if (SOLID_ROLES.has(role) && group !== 'wallpaper')
      contrast = contrastRatio(onSolid, value);
    return { path: path.join('.'), value, cssVar: cssVarName('color', ...path), contrast };
  });
}
