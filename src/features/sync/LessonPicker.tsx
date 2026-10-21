import {
  allLessonKeys,
  chapterKey,
  chapterSelection,
  lessonKey,
  toggleChapter,
  toggleLesson,
  type ChapterGroup,
  type Entry,
} from '../../domain';
import { useI18n } from '../../i18n';
import { Button, Checkbox, ListGroup, ListItem } from '../../ui';
import styles from './SyncSheet.module.css';

interface LessonPickerProps {
  readonly groups: readonly ChapterGroup<Entry>[];
  readonly selected: ReadonlySet<string>;
  readonly onChange: (selected: ReadonlySet<string>) => void;
  readonly isDisabled: boolean;
  /** 选择摘要（“已选 3 个课时 · 42 个词”） */
  readonly summary: string;
}

/** 按课时同步（F-076）：章节复选框显示全选 / 半选，点按章节即全选或取消整章 */
export function LessonPicker({
  groups,
  selected,
  onChange,
  isDisabled,
  summary,
}: LessonPickerProps) {
  const { messages } = useI18n();
  const text = messages.sync.send;
  return (
    <>
      <div className={styles.pickerToolbar}>
        <span className={styles.note} role="status">
          {summary}
        </span>
        <div className={styles.buttons}>
          <Button
            size="sm"
            variant="plain"
            isDisabled={isDisabled}
            onPress={() => {
              onChange(allLessonKeys(groups));
            }}
          >
            {text.selectAll}
          </Button>
          <Button
            size="sm"
            variant="plain"
            isDisabled={isDisabled || selected.size === 0}
            onPress={() => {
              onChange(new Set());
            }}
          >
            {text.clearAll}
          </Button>
        </div>
      </div>
      <ListGroup header={text.lessonsHeader} headingLevel={3}>
        {groups.map((group) => {
          const state = chapterSelection(group, selected);
          return (
            <ListItem key={chapterKey(group.chapter)} className={styles.chapter}>
              <Checkbox
                className={styles.choice}
                isSelected={state === 'all'}
                isIndeterminate={state === 'some'}
                isDisabled={isDisabled}
                onChange={() => {
                  onChange(toggleChapter(selected, group));
                }}
              >
                <span className={styles.chapterName}>{group.chapter}</span>
                <span className={styles.count}>{text.wordCount(group.entryCount)}</span>
              </Checkbox>
              <ul className={styles.lessons}>
                {group.lessons.map(({ chapter, lesson, entries }) => (
                  <li key={lessonKey(chapter, lesson)}>
                    <Checkbox
                      className={styles.choice}
                      isSelected={selected.has(lessonKey(chapter, lesson))}
                      isDisabled={isDisabled}
                      onChange={() => {
                        onChange(toggleLesson(selected, chapter, lesson));
                      }}
                    >
                      <span>{lesson}</span>
                      <span className={styles.count}>{text.wordCount(entries.length)}</span>
                    </Checkbox>
                  </li>
                ))}
              </ul>
            </ListItem>
          );
        })}
      </ListGroup>
    </>
  );
}
