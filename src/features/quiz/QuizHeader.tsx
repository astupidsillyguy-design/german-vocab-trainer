import { Check, X } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import { tallyOf, wrongAnswers, type QuizSession } from '../../domain';
import { useI18n } from '../../i18n';
import { Badge, Button, Popover, PopoverTrigger, ProgressBar } from '../../ui';
import { scopeLabel } from './scope';
import styles from './QuizPage.module.css';

interface WrongAnswersProps {
  readonly session: QuizSession;
  readonly count: number;
}

/** F-013 本轮答错的词：按钮打开气泡（键盘可达，Esc 关闭后焦点回到按钮） */
function WrongAnswers({ session, count }: WrongAnswersProps) {
  const { messages } = useI18n();
  const text = messages.quiz;
  const items = wrongAnswers(session);
  return (
    <PopoverTrigger>
      <Button
        size="sm"
        variant="glass"
        className={styles.wrongButton}
        // 不抢输入框的焦点：手机键盘不收起
        preventFocusOnPress
        leadingIcon={<X size={componentGeometry.iconSm} aria-hidden />}
      >
        {text.wrongCount(count)}
      </Button>
      <Popover title={text.wrongList.title} placement="bottom end">
        {items.length === 0 ? (
          <p className={styles.wrongEmpty}>{text.wrongList.empty}</p>
        ) : (
          <ol className={styles.wrongList}>
            {items.map(({ question, input }) => (
              <li key={question.id} className={styles.wrongItem}>
                <span className={styles.wrongSection}>
                  {messages.entry.section(question.chapter, question.lesson)}
                </span>
                <span className={styles.wrongAnswer}>
                  <span className="visually-hidden">{text.wrongList.answer}</span>
                  <span lang="de">{question.answers[0]}</span>
                </span>
                <span className={styles.wrongInput}>
                  <span className="visually-hidden">{text.wrongList.yourInput}</span>
                  <del lang="de">{input}</del>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Popover>
    </PopoverTrigger>
  );
}

export interface QuizScopeRowProps {
  readonly session: QuizSession;
}

/** 测验范围；重测轮次另显示轮次与固定错词数 */
export function QuizScopeRow({ session }: QuizScopeRowProps) {
  const { messages } = useI18n();
  const text = messages.quiz;
  return (
    <div className={styles.scopeRow}>
      <p className={styles.scope}>{scopeLabel(session.scope, messages)}</p>
      {session.round > 1 && (
        <Badge tone="warning" size="sm" className={styles.round}>
          {text.round(session.round)} · {text.lockedCount(session.lockedIds.length)}
        </Badge>
      )}
    </div>
  );
}

export interface QuizHeaderProps {
  readonly session: QuizSession;
}

/** F-010 – F-013 测验范围、轮次、进度与正误计数 */
export function QuizHeader({ session }: QuizHeaderProps) {
  const { messages } = useI18n();
  const text = messages.quiz;
  const tally = tallyOf(session);
  const current = Math.min(session.index + 1, tally.total);
  return (
    <div className={styles.header}>
      <QuizScopeRow session={session} />
      <ProgressBar
        label={text.progress}
        value={tally.answered}
        maxValue={tally.total}
        valueLabel={text.questionIndex(current, tally.total)}
      />
      <div className={styles.tally}>
        <Badge tone="success" icon={<Check size={componentGeometry.iconSm} />}>
          {text.correctCount(tally.correct)}
        </Badge>
        <WrongAnswers session={session} count={tally.wrong} />
      </div>
    </div>
  );
}
