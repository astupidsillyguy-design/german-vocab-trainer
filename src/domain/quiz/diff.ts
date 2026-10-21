/**
 * 答错反馈的字母级对比（F-029）：基于最长公共子序列，标出输入中多写的字母与答案中漏写的字母。
 * 比较时不区分大小写（与判分一致），显示时保留各自的原文。
 */
import { normalizeText } from '../text';

export type DiffKind = 'same' | 'extra' | 'missing';

export interface DiffPart {
  readonly kind: DiffKind;
  readonly text: string;
}

export interface AnswerDiff {
  /** 参与对比的那个可接受答案（与输入最接近的一个） */
  readonly answer: string;
  /** 用户输入：same 与 extra（多写或写错的字母） */
  readonly inputParts: readonly DiffPart[];
  /** 正确答案：same 与 missing（漏写或写错的字母） */
  readonly answerParts: readonly DiffPart[];
}

/** 动态规划表的单元格上限：超出时（异常长的输入）不做逐字对比，整段标出 */
const MAX_TABLE_CELLS = 250_000;
/**
 * 相同的字母不到较长一方的一半时，说明写的是另一个词：逐字标出只会是一片噪点，
 * 改为整段标出（输入整段删除线、答案整段下划线）。
 */
const MIN_SHARED_RATIO = 0.5;

function fold(character: string): string {
  return character.toLowerCase();
}

interface Alignment {
  readonly inputParts: readonly DiffPart[];
  readonly answerParts: readonly DiffPart[];
  /** 需要增删的字母数（越小越接近） */
  readonly distance: number;
  /** 相同（按顺序对上）的字母数 */
  readonly common: number;
}

function pushPart(parts: DiffPart[], kind: DiffKind, character: string): void {
  const last = parts.at(-1);
  if (last?.kind === kind) parts[parts.length - 1] = { kind, text: last.text + character };
  else parts.push({ kind, text: character });
}

function wholeMismatch(input: readonly string[], answer: readonly string[]): Alignment {
  const inputText = input.join('');
  const answerText = answer.join('');
  return {
    inputParts: inputText === '' ? [] : [{ kind: 'extra', text: inputText }],
    answerParts: answerText === '' ? [] : [{ kind: 'missing', text: answerText }],
    distance: input.length + answer.length,
    common: 0,
  };
}

function align(input: readonly string[], answer: readonly string[]): Alignment {
  const rows = input.length + 1;
  const columns = answer.length + 1;
  if (rows * columns > MAX_TABLE_CELLS) return wholeMismatch(input, answer);

  const foldedInput = input.map(fold);
  const foldedAnswer = answer.map(fold);
  // lengths[i * columns + j]：input[i..] 与 answer[j..] 的最长公共子序列长度
  const lengths = new Uint16Array(rows * columns);
  for (let i = input.length - 1; i >= 0; i--) {
    for (let j = answer.length - 1; j >= 0; j--) {
      lengths[i * columns + j] =
        foldedInput[i] === foldedAnswer[j]
          ? (lengths[(i + 1) * columns + j + 1] ?? 0) + 1
          : Math.max(lengths[(i + 1) * columns + j] ?? 0, lengths[i * columns + j + 1] ?? 0);
    }
  }

  const inputParts: DiffPart[] = [];
  const answerParts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < input.length && j < answer.length) {
    const inputCharacter = input[i] ?? '';
    const answerCharacter = answer[j] ?? '';
    if (foldedInput[i] === foldedAnswer[j]) {
      pushPart(inputParts, 'same', inputCharacter);
      pushPart(answerParts, 'same', answerCharacter);
      i++;
      j++;
    } else if ((lengths[(i + 1) * columns + j] ?? 0) >= (lengths[i * columns + j + 1] ?? 0)) {
      pushPart(inputParts, 'extra', inputCharacter);
      i++;
    } else {
      pushPart(answerParts, 'missing', answerCharacter);
      j++;
    }
  }
  for (; i < input.length; i++) pushPart(inputParts, 'extra', input[i] ?? '');
  for (; j < answer.length; j++) pushPart(answerParts, 'missing', answer[j] ?? '');

  const common = lengths[0] ?? 0;
  return { inputParts, answerParts, distance: input.length + answer.length - 2 * common, common };
}

/**
 * 与最接近的可接受答案逐字对比；距离相同时取靠前的答案（第一个是标准答案）。
 * 按码位切分：NFC 规范化后德语字母（含 ä ö ü ß）都是单个码位。
 */
export function diffAnswer(input: string, answers: readonly [string, ...string[]]): AnswerDiff {
  const inputCharacters = Array.from(normalizeText(input));
  const [first, ...others] = answers;
  let best = { ...align(inputCharacters, Array.from(first)), answer: first };
  for (const answer of others) {
    const alignment = align(inputCharacters, Array.from(answer));
    if (alignment.distance < best.distance) best = { ...alignment, answer };
  }
  const answerCharacters = Array.from(best.answer);
  const longer = Math.max(inputCharacters.length, answerCharacters.length);
  const parts =
    best.common < longer * MIN_SHARED_RATIO
      ? wholeMismatch(inputCharacters, answerCharacters)
      : best;
  return { answer: best.answer, inputParts: parts.inputParts, answerParts: parts.answerParts };
}
