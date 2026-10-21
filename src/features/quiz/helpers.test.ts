import { describe, expect, it } from 'vitest';
import { catalogs } from '../../test/messages';
import { insertText } from './insert';
import { scopeLabel } from './scope';

describe('特殊字符插入', () => {
  it('在光标处插入，替换选中的文字，并返回插入后的光标位置', () => {
    expect(insertText('Mdchen', { start: 1, end: 1 }, 'ä', 40)).toEqual({
      value: 'Mädchen',
      caret: 2,
    });
    expect(insertText('Maedchen', { start: 1, end: 3 }, 'ä', 40)).toEqual({
      value: 'Mädchen',
      caret: 2,
    });
  });

  it('没有光标信息时插在末尾；超出长度上限时不插入', () => {
    expect(insertText('gro', { start: null, end: null }, 'ß', 40)).toEqual({
      value: 'groß',
      caret: 4,
    });
    expect(insertText('abc', { start: 1, end: 1 }, 'ü', 3)).toBeNull();
  });
});

describe('测验范围名称', () => {
  const messages = catalogs['zh-CN'];

  it('整个集合、单个课时、整个章节与组合测试', () => {
    expect(scopeLabel({ source: 'pool', sections: [] }, messages)).toBe('全部待测词汇');
    expect(scopeLabel({ source: 'archive', sections: [] }, messages)).toBe('全部归档词汇');
    expect(
      scopeLabel({ source: 'archive', sections: [{ chapter: 'A1', lesson: '第1讲' }] }, messages),
    ).toBe('A1 · 第1讲');
    expect(
      scopeLabel(
        {
          source: 'archive',
          sections: [
            { chapter: 'A1', lesson: '第1讲' },
            { chapter: 'A2', lesson: null },
          ],
        },
        messages,
      ),
    ).toBe('组合测试 · A1 · 第1讲 + A2');
  });
});
