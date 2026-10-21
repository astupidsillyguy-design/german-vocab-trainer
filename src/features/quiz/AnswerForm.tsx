import { useEffect, useLayoutEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import {
  diffAnswer,
  isBlankAnswer,
  LIMITS,
  type QuizQuestion,
  type QuizResponse,
  type QuizSession,
} from '../../domain';
import { useI18n } from '../../i18n';
import { Button, KeyButton, TextField, useSizeClass } from '../../ui';
import { AnswerFeedback } from './AnswerFeedback';
import { useQuizStore } from './context';
import { insertText } from './insert';
import { promptText } from './QuestionCard';
import styles from './QuizPage.module.css';

/** F-017 德语特殊字符（原版的同一组键） */
export const SPECIAL_CHARACTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;

export interface AnswerFormProps {
  readonly session: QuizSession;
  readonly question: QuizQuestion;
  readonly response: QuizResponse | null;
  /** 题面元素的 id（输入框的补充说明） */
  readonly promptId: string;
}

interface Draft {
  /** 草稿属于哪一题：换题后旧草稿自动作废，输入框本身不重新挂载（手机键盘不会收起） */
  readonly key: string;
  readonly text: string;
}

/**
 * F-016 – F-019 作答：输入框、特殊字符键、提交 / 下一题、空答案提示与作答反馈。
 *
 * 一道题从作答到反馈再到下一题，焦点始终留在输入框：回车提交、再回车下一题，手机键盘不收起。
 * 宽屏（有实体键盘）每道新题自动聚焦输入框；手机上不自动聚焦，避免键盘突然弹出挡住题面。
 */
export function AnswerForm({ session, question, response, promptId }: AnswerFormProps) {
  const { messages } = useI18n();
  const text = messages.quiz;
  const quiz = useQuizStore();
  const sizeClass = useSizeClass();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  const questionKey = `${session.id}:${String(session.round)}:${String(session.index)}:${question.id}`;
  const [draft, setDraft] = useState<Draft>({ key: questionKey, text: '' });
  const [hintKey, setHintKey] = useState<string | null>(null);

  const draftText = draft.key === questionKey ? draft.text : '';
  const isAnswered = response !== null;
  const value = isAnswered ? response.input : draftText;
  const showHint = !isAnswered && hintKey === questionKey && isBlankAnswer(draftText);
  const isLast = session.index === session.order.length - 1;

  const diff = useMemo(
    () =>
      response === null || response.correct ? null : diffAnswer(response.input, question.answers),
    [response, question.answers],
  );

  const announcement =
    response === null
      ? text.questionAnnounce(
          session.index + 1,
          session.order.length,
          promptText(question, messages),
        )
      : response.correct
        ? text.correct.announce(question.answers[0])
        : text.wrong.announce(diff?.answer ?? question.answers[0]);

  const autoFocus = sizeClass !== 'compact';
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, questionKey]);

  // 插入特殊字符后把光标放回插入点之后（受控输入框重新渲染会把光标移到末尾）
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    inputRef.current?.setSelectionRange(caret, caret);
  }, [draft]);

  const insert = (character: string): void => {
    const input = inputRef.current;
    if (input === null || isAnswered) return;
    const edit = insertText(
      draftText,
      { start: input.selectionStart, end: input.selectionEnd },
      character,
      LIMITS.answerLength,
    );
    if (edit === null) return;
    pendingCaret.current = edit.caret;
    setDraft({ key: questionKey, text: edit.value });
    input.focus();
  };

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isAnswered) {
      quiz.next();
      return;
    }
    if (isBlankAnswer(draftText)) {
      // F-019 空答案不判分，只轻提示
      setHintKey(questionKey);
      inputRef.current?.focus();
      return;
    }
    quiz.submit(draftText);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field} data-result={diff === null ? undefined : 'wrong'}>
        <TextField
          inputRef={inputRef}
          label={text.answerLabel}
          hideLabel
          size="xl"
          placeholder={text.placeholder}
          inputLang="de"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck="false"
          enterKeyHint={isAnswered ? 'next' : 'go'}
          maxLength={LIMITS.answerLength}
          aria-describedby={promptId}
          isClearable
          isReadOnly={isAnswered}
          value={value}
          onChange={(next) => {
            setDraft({ key: questionKey, text: next });
          }}
          onKeyDown={(event) => {
            // 按住回车不放时不连续提交、跳题（否则来不及看反馈）
            if (event.key === 'Enter' && event.repeat) event.preventDefault();
            event.continuePropagation();
          }}
        />
      </div>

      <div className={styles.keys} role="group" aria-label={text.specialCharacters}>
        {SPECIAL_CHARACTERS.map((character) => (
          <KeyButton
            key={character}
            character={character}
            onInsert={insert}
            isDisabled={isAnswered}
            className={styles.key}
          />
        ))}
      </div>

      <p className={styles.hint} role="status">
        {showHint ? text.emptyAnswer : ''}
      </p>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>

      {response !== null && <AnswerFeedback question={question} response={response} diff={diff} />}

      <Button
        type="submit"
        variant="filled"
        size="lg"
        fullWidth
        // 保持输入框的焦点（手机键盘不收起）
        preventFocusOnPress
      >
        {isAnswered ? (isLast ? text.showResults : text.next) : text.submit}
      </Button>
    </form>
  );
}
