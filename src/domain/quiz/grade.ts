/**
 * 判分（F-025 / F-026）：与答案去重共用 answerKey 的规则——不区分大小写、标点视为空格、
 * ä 与 ae 不互通。名词的可接受答案只有带冠词的形式（解析器保证），因此漏写冠词即判错。
 */
import { answerKey } from '../answer';

/** 输入在判分规则下为空（只有空格或标点）：不判分，只提示先作答（F-019） */
export function isBlankAnswer(input: string): boolean {
  return answerKey(input) === '';
}

export function isCorrectAnswer(input: string, answers: readonly string[]): boolean {
  const key = answerKey(input);
  return key !== '' && answers.some((answer) => answerKey(answer) === key);
}
