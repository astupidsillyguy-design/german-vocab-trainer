import { useMemo } from 'react';
import { lessonKey, previewSyncPayload, type Library, type SyncPayload } from '../../domain';
import { useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../ui';
import styles from './SyncSheet.module.css';

/** 课时列表最多显示的行数（整库覆盖时可能涉及几百个课时） */
export const PREVIEW_LESSON_LIMIT = 100;

interface SyncPreviewProps {
  readonly library: Library;
  readonly payload: SyncPayload;
}

/**
 * 接收前的预览（F-078）：覆盖方式、收到多少、新增 / 删除 / 内容相同的数量，以及涉及的课时。
 * 对方发来的章节与课时名称一律作为纯文本渲染（原版用 innerHTML 拼接，可被远程注入脚本）。
 */
export function SyncPreview({ library, payload }: SyncPreviewProps) {
  const { messages } = useI18n();
  const text = messages.sync.receive;
  const preview = useMemo(() => previewSyncPayload(library, payload), [library, payload]);
  const shown = preview.lessons.slice(0, PREVIEW_LESSON_LIMIT);
  const hidden = preview.lessons.length - shown.length;
  const counts = [
    [text.added, preview.added],
    [text.removed, preview.removed],
    [text.unchanged, preview.unchanged],
  ] as const;

  return (
    <>
      <ListGroup footer={text.footer}>
        <ListRow
          title={text.modes[preview.mode]}
          subtitle={text.incoming(preview.incoming.entries, preview.incoming.lessons)}
        />
        {counts.map(([label, count]) => (
          <ListRow
            key={label}
            title={label}
            trailing={<span className={styles.value}>{text.wordCount(count)}</span>}
          />
        ))}
      </ListGroup>
      <ListGroup
        header={text.lessonsHeader}
        headingLevel={3}
        {...(hidden > 0 ? { footer: text.moreLessons(hidden) } : {})}
      >
        {shown.map((change) => (
          <ListRow
            key={lessonKey(change.chapter, change.lesson)}
            title={change.lesson}
            subtitle={change.chapter}
            trailing={
              <span className={styles.value}>
                {change.current === 0
                  ? text.newLesson(change.incoming)
                  : change.incoming === 0
                    ? text.removedLesson(change.current)
                    : text.lessonChange(change.current, change.incoming)}
              </span>
            }
          />
        ))}
      </ListGroup>
    </>
  );
}
