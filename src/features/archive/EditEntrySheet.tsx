import { useState } from 'react';
import { LIMITS, type EditError, type Entry, type EntryEdit } from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import { TextArea, TextField } from '../../ui';
import { FormSheet } from './FormSheet';
import styles from './ArchivePage.module.css';

const LINE_BREAK = '\n';
const ALTERNATIVE_ROWS = 3;

type Field = 'answer' | 'alternatives' | 'prompt';

/** 错误显示在对应的输入框下；与具体输入框无关的错误显示在表单顶部 */
const ERROR_FIELDS = {
  answerRequired: 'answer',
  promptRequired: 'prompt',
  tooManyAnswers: 'alternatives',
  missing: null,
  invalid: null,
} as const satisfies Record<EditError, Field | null>;

function errorText(error: EditError, text: Messages['archive']['edit']['errors']): string {
  return error === 'tooManyAnswers' ? text.tooManyAnswers(LIMITS.answersPerEntry) : text[error];
}

export interface EditEntrySheetProps {
  readonly entry: Entry;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** 保存成功（或没有修改）时返回 null，面板随即关闭 */
  readonly onSave: (edit: EntryEdit) => EditError | null;
  /** 关闭后原来的焦点位置已不在时（双击整行打开等）接手的元素，通常是这个词条的编辑按钮 */
  readonly fallbackFocus: () => HTMLElement | null;
}

/**
 * 编辑词条（F-051）：德语、其他可接受答案（每行一个，原版编辑时会丢掉它们）与释义。
 * 每次打开都重新挂载（调用方以 key 区分），输入从词条的当前内容开始。
 */
export function EditEntrySheet({
  entry,
  isOpen,
  onOpenChange,
  onSave,
  fallbackFocus,
}: EditEntrySheetProps) {
  const { messages } = useI18n();
  const text = messages.archive.edit;
  const [word, ...others] = entry.answers;
  const initial = { answer: word, alternatives: others.join(LINE_BREAK), prompt: entry.prompt };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<EditError | null>(null);
  const isDirty =
    draft.answer !== initial.answer ||
    draft.alternatives !== initial.alternatives ||
    draft.prompt !== initial.prompt;

  const change = (field: Field) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  };
  const fieldError = (field: Field) =>
    error !== null && ERROR_FIELDS[error] === field
      ? { isInvalid: true, errorMessage: errorText(error, text.errors) }
      : {};

  return (
    <FormSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={text.title}
      submitLabel={text.save}
      isDirty={isDirty}
      fallbackFocus={fallbackFocus}
      onSubmit={() => {
        const result = onSave({
          answer: draft.answer,
          alternatives: draft.alternatives.split(LINE_BREAK),
          prompt: draft.prompt,
        });
        if (result === null) onOpenChange(false);
        else setError(result);
      }}
    >
      {error !== null && ERROR_FIELDS[error] === null && (
        <p className={styles.formError} role="alert">
          {errorText(error, text.errors)}
        </p>
      )}
      <TextField
        label={text.answer}
        value={draft.answer}
        onChange={change('answer')}
        inputLang="de"
        autoCapitalize="none"
        {...fieldError('answer')}
      />
      <TextArea
        label={text.alternatives}
        description={text.alternativesDescription}
        value={draft.alternatives}
        onChange={change('alternatives')}
        rows={ALTERNATIVE_ROWS}
        autoCapitalize="none"
        {...fieldError('alternatives')}
      />
      <TextField
        label={text.prompt}
        value={draft.prompt}
        onChange={change('prompt')}
        {...fieldError('prompt')}
      />
    </FormSheet>
  );
}
