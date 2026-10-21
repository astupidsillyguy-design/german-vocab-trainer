import { describe, expect, it } from 'vitest';
import { squirclePath } from './squircle.ts';

const COMMAND = /([MLcaZ])([^MLcaZ]*)/g;

/** 依次计算每段路径的终点（绝对坐标），用于验证几何正确性。 */
function endpoints(path: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (const [, command = '', args = ''] of path.matchAll(COMMAND)) {
    const values = args.trim().split(/\s+/).filter(Boolean).map(Number);
    const dx = values.at(-2) ?? 0;
    const dy = values.at(-1) ?? 0;
    if (command === 'M' || command === 'L') {
      x = dx;
      y = dy;
    } else if (command === 'c' || command === 'a') {
      x += dx;
      y += dy;
    } else {
      continue;
    }
    points.push({ x, y });
  }
  return points;
}

describe('squirclePath', () => {
  it('生成闭合路径', () => {
    const path = squirclePath({ width: 200, height: 100, radius: 20, smoothing: 0.6 });
    expect(path.startsWith('M')).toBe(true);
    expect(path.trimEnd().endsWith('Z')).toBe(true);
  });

  it('所有分段终点都在元素边界内，最后一段停在上边缘（由 Z 闭合）', () => {
    const width = 120;
    const height = 48;
    const points = endpoints(squirclePath({ width, height, radius: 24, smoothing: 0.6 }));
    expect(points.length).toBeGreaterThan(4);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(-0.01);
      expect(point.x).toBeLessThanOrEqual(width + 0.01);
      expect(point.y).toBeGreaterThanOrEqual(-0.01);
      expect(point.y).toBeLessThanOrEqual(height + 0.01);
    }
    const first = points[0];
    const last = points.at(-1);
    expect(first?.y).toBeCloseTo(0);
    expect(last?.y).toBeCloseTo(0);
    expect(last?.x).toBeLessThan(first?.x ?? Number.NaN);
  });

  it('半径超过短边一半时自动收缩，不产生 NaN', () => {
    const path = squirclePath({ width: 40, height: 40, radius: 100, smoothing: 1 });
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  it('半径为 0 时退化为矩形', () => {
    const path = squirclePath({ width: 10, height: 10, radius: 0, smoothing: 0.6 });
    expect(path).not.toContain('c');
    expect(path).not.toContain('a');
  });

  it('平滑度越高，圆角占用的边越长', () => {
    const smooth = squirclePath({ width: 200, height: 200, radius: 40, smoothing: 1 });
    const circular = squirclePath({ width: 200, height: 200, radius: 40, smoothing: 0 });
    expect(smooth).not.toBe(circular);
  });
});
