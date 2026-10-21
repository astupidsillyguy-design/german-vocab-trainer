/**
 * 测试用的原版数据（F-005）：原版的词条格式、localStorage 布局与导出文件。
 */
import {
  LEGACY_EXPORT_KIND,
  LEGACY_EXPORT_VERSION,
  LEGACY_KEYS,
  LEGACY_PARTS,
  type LegacyPart,
} from '../domain';

const LESSON = '第30讲: Ein Apartment im Studentenwohnheim';

/** 待测词：答案已按原版规则展开（名词额外接受不带冠词的写法） */
export const LEGACY_SCHRANK = {
  chapter: 'A1',
  lesson: LESSON,
  prompt: '柜子',
  answers: ['der Schrank', 'Schrank'],
  _uid: 'uid_schrank',
};

export const LEGACY_HELFEN = {
  chapter: 'A1',
  lesson: LESSON,
  prompt: '帮助',
  answers: ['helfen'],
};

/** 归档词：原版记录的归档日期 */
export const LEGACY_TISCH = {
  chapter: 'A1',
  lesson: LESSON,
  prompt: '桌子',
  answers: ['der Tisch', 'Tisch'],
  archivedAt: '2025-01-10',
};

/** 无法转换的词条（没有答案） */
export const LEGACY_BROKEN = { chapter: 'A1', lesson: LESSON, prompt: '坏', answers: [] };

export type LegacyFixture = Partial<Readonly<Record<LegacyPart, unknown>>>;

/** 待测 2 词（柜子、帮助），归档 1 词（桌子），一份接收同步前的备份（归档 2 词） */
export const LEGACY_FIXTURE: LegacyFixture = {
  pool: [LEGACY_SCHRANK, LEGACY_HELFEN],
  archive: [LEGACY_TISCH],
  order: { chapters: ['A1'], lessons: { A1: [LESSON] } },
  backup: {
    archivedList: [LEGACY_TISCH, { ...LEGACY_TISCH, prompt: '椅子', answers: ['der Stuhl'] }],
    archiveOrder: { chapters: ['A1'], lessons: { A1: [LESSON] } },
  },
};

/** 原版在 localStorage 中保存的样子：每一部分是一段 JSON 文本 */
export function legacyKeyMap(fixture: LegacyFixture = LEGACY_FIXTURE): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const part of LEGACY_PARTS) {
    const value = fixture[part];
    if (value !== undefined) keys[LEGACY_KEYS[part]] = JSON.stringify(value);
  }
  return keys;
}

export function seedLegacyStorage(fixture: LegacyFixture = LEGACY_FIXTURE): void {
  for (const [key, value] of Object.entries(legacyKeyMap(fixture))) {
    localStorage.setItem(key, value);
  }
}

/** 导出工具生成的文件内容 */
export function legacyExportFile(fixture: LegacyFixture = LEGACY_FIXTURE): string {
  return JSON.stringify({
    kind: LEGACY_EXPORT_KIND,
    version: LEGACY_EXPORT_VERSION,
    exportedAt: '2025-01-15T08:30:00.000Z',
    keys: legacyKeyMap(fixture),
  });
}
