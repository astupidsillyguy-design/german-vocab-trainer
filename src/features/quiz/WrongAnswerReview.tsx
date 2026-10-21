import { useId } from 'react';
import type { WrongAnswer } from '../../domain';
import { useI18n } from '../../i18n';
import { Badge, Surface } from '../../ui';
import { promptText } from './QuestionCard';
import { SpeakButton } from './SpeakButton';
import styles from './RoundResult.module.css';

export interface WrongAnswerReviewProps {
  /** 本轮答错的题（按作答顺序） */
  readonly items: readonly WrongAnswer[];
}

/**
 * F-031 错题集：课时、题面、标准答案、你的输入（删除线）与发音。
 * 全部内容都作为文本渲染（React 自动转义），不会像原版那样把词条拼进 HTML。
 */
export function WrongAnswerReview({ items }: WrongAnswerReviewProps) {
  const { messages } = useI18n();
  const text = messages.quiz.result;
  const headingId = useId();
  return (
    <section className={styles.review} aria-labelledby={headingId}>
      <div className={styles.reviewHeader}>
        <h3 id={headingId} className={styles.reviewTitle}>
          {text.wrongTitle}
        </h3>
        <Badge tone="danger" size="sm">
          {text.wrongCount(items.length)}
        </Badge>
      </div>
      <Surface material="regular" radius="lg" elevation={1}>
        <ol className={styles.reviewList}>
          {items.map(({ question, input }) => {
            const answer = question.answers[0];
            return (
              <li key={question.id} className={styles.reviewItem}>
                <div className={styles.reviewText}>
                  <span className={styles.reviewContext}>
                    {messages.entry.section(question.chapter, question.lesson)}
                  </span>
                  <span className={styles.reviewPrompt}>{promptText(question, messages)}</span>
                  <span className={styles.reviewAnswer}>
                    <span className="visually-hidden">{messages.quiz.wrongList.answer}</span>
                    <span lang="de">{answer}</span>
                  </span>
                  <span className={styles.reviewInput}>
                    <span className="visually-hidden">{messages.quiz.wrongList.yourInput}</span>
                    {input === '' ? text.noInput : <del lang="de">{input}</del>}
                  </span>
                </div>
                <SpeakButton text={answer} iconOnly />
              </li>
            );
          })}
        </ol>
      </Surface>
    </section>
  );
}
