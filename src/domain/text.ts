/**
 * 文本规范化。
 *
 * - NFC：同一个 ä 可能以“a + 组合分音符”两个码位输入（macOS 文件名、部分输入法），
 *   规范化后才能与预组合字符比较；
 * - 空白折叠：制表符、不换行空格（U+00A0 / U+202F）、全角空格等一律视为一个普通空格。
 */
export function normalizeText(value: string): string {
  return collapseWhitespace(value.normalize('NFC'));
}

/** 只折叠空白（调用方已确保文本是 NFC 时使用，省去重复的规范化） */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** 去重并保持首次出现的顺序；key 决定“相同”的含义 */
export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    output.push(item);
  }
  return output;
}
