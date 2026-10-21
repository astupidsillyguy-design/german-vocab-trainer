/**
 * 数据上限。既约束用户输入，也约束导入文件与同步消息，防止异常数据拖垮界面或存储。
 * 数值远高于正常使用（一个课时通常 20～60 词，一本教材不过几千词）。
 */
export const LIMITS = {
  /** 章节、课时名称的字符数 */
  groupNameLength: 200,
  /** 题面（中文释义）的字符数 */
  promptLength: 500,
  /** 单个答案的字符数 */
  answerLength: 200,
  /** 每个词条的可接受答案数 */
  answersPerEntry: 16,
  /** 原形词条上记录的变形数 */
  linkedFormsPerEntry: 16,
  /** 待测库或归档库的词条数 */
  entriesPerCollection: 20_000,
  /** 归档排序表中的章节数 */
  chapters: 2_000,
  /** 每个章节的课时数 */
  lessonsPerChapter: 2_000,
  /** ISO 8601 时间字符串的长度上限 */
  timestampLength: 40,
} as const;
