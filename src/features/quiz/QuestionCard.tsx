import { Bookmark } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import type { QuizQuestion } from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import { Badge } from '../../ui';
import styles from './QuizPage.module.css';

const VERB_FORM_SEPARATOR = ' · ';

/** 题面的纯文本（读屏播报用）：变形题读“原形 · 二分词” */
export function promptText(question: QuizQuestion, messages: Messages): string {
  const { verbForm } = question;
  return verbForm === null
    ? question.prompt
    : `${verbForm.base}${VERB_FORM_SEPARATOR}${messages.entry.verbForm[verbForm.kind]}`;
}

export interface QuestionCardProps {
  readonly question: QuizQuestion;
  /** 题面元素的 id：答题输入框用 aria-describedby 引用它 */
  readonly promptId: string;
}

/**
 * F-015 题卡：课时标签、作答说明与题面。全部内容以 React 文本渲染，词表里的任何字符都不会被当作 HTML。
 * 动词变形题（F-027）显示原形（德语）与要写的形式，界面语言不是中文时同样看得懂。
 */
export function QuestionCard({ question, promptId }: QuestionCardProps) {
  const { messages } = useI18n();
  const text = messages.quiz;
  const { verbForm } = question;
  return (
    <div className={styles.question}>
      <p className={styles.section}>
        <Bookmark size={componentGeometry.iconSm} aria-hidden />
        <span className={styles.sectionName}>
          {messages.entry.section(question.chapter, question.lesson)}
        </span>
      </p>
      <p className={styles.instruction}>
        {verbForm === null ? text.instruction : text.verbFormInstruction[verbForm.kind]}
      </p>
      {verbForm === null ? (
        <p id={promptId} className={styles.prompt}>
          {question.prompt}
        </p>
      ) : (
        <p id={promptId} className={styles.prompt}>
          <span lang="de">{verbForm.base}</span>
          <Badge tone="tint" className={styles.promptBadge}>
            {messages.entry.verbForm[verbForm.kind]}
          </Badge>
        </p>
      )}
    </div>
  );
}
