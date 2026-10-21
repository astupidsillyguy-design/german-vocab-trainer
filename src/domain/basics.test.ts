import { describe, expect, it } from 'vitest';
import { answerKey } from './answer';
import { fingerprintOf } from './fingerprint';
import { isEntryId, isUuid, newEntryId, newId } from './id';
import { normalizeText, uniqueBy } from './text';

describe('normalizeText', () => {
  it('NFC 规范化：组合分音符与预组合字符相同', () => {
    expect(normalizeText('Ga\u0308rten')).toBe('Gärten');
  });

  it('各种空白折叠为一个空格并去掉首尾空白', () => {
    expect(normalizeText('\u00a0der\tSchrank\u202f \u3000')).toBe('der Schrank');
  });

  it('uniqueBy 保留首次出现的顺序', () => {
    expect(uniqueBy(['b', 'A', 'a', 'B'], (value) => value.toLowerCase())).toEqual(['b', 'A']);
  });
});

describe('answerKey（判分与去重的比较键）', () => {
  it('不区分大小写', () => {
    expect(answerKey('Der Schrank')).toBe(answerKey('der schrank'));
    expect(answerKey('STRASSE')).toBe('strasse');
  });

  it('标点视为空格', () => {
    expect(answerKey('jm. bei etw. helfen')).toBe(answerKey('jm bei etw helfen'));
    expect(answerKey('jm bei etw.(D.) helfen')).toBe('jm bei etw d helfen');
  });

  it('变音字母不替换：ä ≠ ae，ß ≠ ss', () => {
    expect(answerKey('die Ärztin')).not.toBe(answerKey('die Aerztin'));
    expect(answerKey('die Straße')).not.toBe(answerKey('die Strasse'));
    expect(answerKey('STRAẞE')).toBe(answerKey('straße'));
  });
});

describe('id', () => {
  it('newId 生成小写 UUID v4', () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
    expect(id).toMatch(/^[0-9a-f-]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it('非安全上下文（没有 randomUUID）时用随机字节生成', () => {
    const source = {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        new Uint8Array(array.buffer).fill(0xff);
        return array;
      },
    };
    expect(newId(source)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('newEntryId 通过 isEntryId 校验；非 UUID 被拒绝', () => {
    expect(isEntryId(newEntryId())).toBe(true);
    expect(isEntryId('uid_abc123')).toBe(false);
    expect(isEntryId('00000000-0000-4000-8000-00000000000G')).toBe(false);
  });
});

describe('fingerprintOf', () => {
  const base = {
    chapter: 'A1',
    lesson: '第30讲',
    prompt: '柜子',
    answers: ['der Schrank'],
  } as const;

  it('格式稳定，空白差异不影响结果', () => {
    const fingerprint = fingerprintOf(base);
    expect(fingerprint).toMatch(/^fp1:[0-9a-f]{16}$/u);
    expect(fingerprintOf({ ...base, prompt: ' 柜子 ', answers: ['der  Schrank'] })).toBe(
      fingerprint,
    );
  });

  it('只看标准答案：备选答案不同仍是同一个词', () => {
    expect(fingerprintOf({ ...base, answers: ['der Schrank', 'der Kleiderschrank'] })).toBe(
      fingerprintOf(base),
    );
  });

  it('大小写有意义（名词 Essen ≠ 动词 essen）', () => {
    expect(fingerprintOf({ ...base, answers: ['Essen'] })).not.toBe(
      fingerprintOf({ ...base, answers: ['essen'] }),
    );
  });

  it('字段边界不会因拼接而混淆', () => {
    expect(fingerprintOf({ ...base, chapter: 'ab', lesson: 'c' })).not.toBe(
      fingerprintOf({ ...base, chapter: 'a', lesson: 'bc' }),
    );
  });
});
