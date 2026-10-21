import { useState } from 'react';
import { LIMITS, groupName, type ArchiveGroup, type RenameError } from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import { TextField } from '../../ui';
import { FormSheet } from './FormSheet';

function errorText(
  error: RenameError,
  kind: ArchiveGroup['kind'],
  text: Messages['archive']['rename']['errors'],
): string {
  switch (error) {
    case 'nameRequired':
      return text.nameRequired;
    case 'nameTooLong':
      return text.nameTooLong(LIMITS.groupNameLength);
    case 'nameTaken':
      return kind === 'chapter' ? text.chapterTaken : text.lessonTaken;
  }
}

export interface RenameSheetProps {
  readonly group: ArchiveGroup;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** 成功（或名称没有变化）时返回 null，面板随即关闭 */
  readonly onSave: (name: string) => RenameError | null;
  /** 改名后章节 / 课时以新名称重新挂载，原来的铅笔按钮已不存在 */
  readonly fallbackFocus: () => HTMLElement | null;
}

/** 章节 / 课时改名（F-052 / F-053）：待测库中同名的章节或课时一起改名 */
export function RenameSheet({
  group,
  isOpen,
  onOpenChange,
  onSave,
  fallbackFocus,
}: RenameSheetProps) {
  const { messages } = useI18n();
  const text = messages.archive.rename;
  const initial = groupName(group);
  const [name, setName] = useState(initial);
  const [error, setError] = useState<RenameError | null>(null);
  const isChapter = group.kind === 'chapter';

  return (
    <FormSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={isChapter ? text.chapterTitle : text.lessonTitle}
      submitLabel={text.save}
      isDirty={name !== initial}
      fallbackFocus={fallbackFocus}
      onSubmit={() => {
        const result = onSave(name);
        if (result === null) onOpenChange(false);
        else setError(result);
      }}
    >
      <TextField
        label={text.name}
        description={isChapter ? text.chapterDescription : text.lessonDescription}
        value={name}
        onChange={(value) => {
          setName(value);
          setError(null);
        }}
        isClearable
        {...(error === null
          ? {}
          : { isInvalid: true, errorMessage: errorText(error, group.kind, text.errors) })}
      />
    </FormSheet>
  );
}
