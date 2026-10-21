import { CircleCheck, CircleX } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import type { AnswerDiff, DiffPart, QuizQuestion, QuizResponse } from '../../domain';
import { useI18n } from '../../i18n';
import styles from './QuizPage.module.css';
import { SpeakButton } from './SpeakButton';

const LIST_SEPARATOR = ' / ';

interface DiffTextProps {
  readonly parts: readonly DiffPart[];
}

/**
 * 字母级对比。差异除颜色外还有删除线（多写）或下划线加粗（漏写），色弱用户同样能分辨；
 * 空格差异以底色显示。读屏读整段原文（见外层的 visually-hidden 文本），不逐段朗读碎片。
 */
function DiffText({ parts }: DiffTextProps) {
  return (
    <span className={styles.diff} lang="de" aria-hidden>
      {parts.map((part, index) =>
        part.kind === 'same' ? (
          part.text
        ) : (
          // 同一段对比结果不会重排，下标可作为 key
          <span key={index} className={styles.diffMark} data-kind={part.kind}>
            {part.text}
          </span>
        ),
      )}
    </span>
  );
}

export interface AnswerFeedbackProps {
  readonly question: QuizQuestion;
  readonly response: QuizResponse;
  /** 答错时的字母级对比；答对时为 null */
  readonly diff: AnswerDiff | null;
}

/** F-028 / F-029 作答反馈（播报由 AnswerForm 的状态区域负责） */
export function AnswerFeedback({ question, response, diff }: AnswerFeedbackProps) {
  const { messages } = useI18n();
  const text = messages.quiz;
  const shown = diff?.answer ?? question.answers[0];
  const alternatives = question.answers.filter((answer) => answer !== shown);

  return (
    <div className={styles.feedback} data-result={response.correct ? 'correct' : 'wrong'}>
      <div className={styles.feedbackHeader}>
        <p className={styles.feedbackTitle}>
          {response.correct ? (
            <CircleCheck size={componentGeometry.iconMd} aria-hidden />
          ) : (
            <CircleX size={componentGeometry.iconMd} aria-hidden />
          )}
          {response.correct ? text.correct.title : text.wrong.title}
        </p>
        <SpeakButton text={shown} />
      </div>

      {diff === null ? (
        <p className={styles.feedbackLine}>
          <span className={styles.feedbackLabel}>{text.correct.standard}</span>
          <span className={styles.answer} lang="de">
            {shown}
          </span>
        </p>
      ) : (
        <>
          <p className={styles.feedbackLine}>
            <span className={styles.feedbackLabel}>{text.wrong.yourInput}</span>
            <DiffText parts={diff.inputParts} />
            <span className="visually-hidden" lang="de">
              {response.input}
            </span>
          </p>
          <p className={styles.feedbackLine}>
            <span className={styles.feedbackLabel}>{text.wrong.answer}</span>
            <DiffText parts={diff.answerParts} />
            <span className="visually-hidden" lang="de">
              {shown}
            </span>
          </p>
        </>
      )}

      {alternatives.length > 0 && (
        <p className={styles.feedbackLine} data-secondary="">
          <span className={styles.feedbackLabel}>{text.alternatives}</span>
          <span lang="de">{alternatives.join(LIST_SEPARATOR)}</span>
        </p>
      )}
    </div>
  );
}
