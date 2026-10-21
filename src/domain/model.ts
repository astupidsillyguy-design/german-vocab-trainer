/**
 * 词条模型（只有类型与常量，不依赖其他模块，避免循环引用）。
 * 待测库与归档库使用同一种词条；归档只是从一个集合移到另一个集合，并记下归档时间。
 */
import type { NonEmptyList } from '../shared/schema';
import type { EntryId } from './id';

export const VERB_FORM_KINDS = ['partizip2', 'praeteritum'] as const;
export type VerbFormKind = (typeof VERB_FORM_KINDS)[number];

/** 动词变形题（F-065）：本词条考的是 base 的二分词或过去式 */
export interface VerbForm {
  readonly kind: VerbFormKind;
  readonly base: string;
}

/** 用户可编辑的内容 */
export interface EntryContent {
  readonly chapter: string;
  readonly lesson: string;
  /** 题面（中文释义，可带词性标注，如“总算 [Adv.]”） */
  readonly prompt: string;
  /** 可接受的答案；第一个是标准答案（显示与朗读都用它） */
  readonly answers: NonEmptyList<string>;
  readonly verbForm: VerbForm | null;
  /** 原形词条上记录的已知变形（例如 einziehen → eingezogen），仅用于展示 */
  readonly linkedForms: readonly string[];
}

export interface Entry extends EntryContent {
  readonly id: EntryId;
  /** ISO 8601 */
  readonly createdAt: string;
  /** 归档时间（ISO 8601）；待测库中为 null */
  readonly archivedAt: string | null;
}

/** 创建或编辑词条时的输入：文本可以未经整理，答案可以重复或为空 */
export interface EntryDraft {
  readonly chapter: string;
  readonly lesson: string;
  readonly prompt: string;
  readonly answers: readonly string[];
  readonly verbForm?: VerbForm | null;
  readonly linkedForms?: readonly string[];
}
