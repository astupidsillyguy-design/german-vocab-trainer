import { CircleAlert, Copy } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import type {
  EntryContent,
  LineLocation,
  LineProblem,
  ParsedWordList,
  RepairId,
} from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import { Badge, Button, Heading, ListGroup, ListRow, SegmentedControl } from '../../ui';
import { previewPage, type PreviewFilter, type PreviewLine } from './sections';
import styles from './WordsPage.module.css';

/** 一次最多渲染的行数；几千行的词表分批显示，输入时不必重建整个列表 */
export const PREVIEW_PAGE_SIZE = 200;

/** 多个答案、多个变形之间的分隔 */
const LIST_SEPARATOR = ' / ';
/** 释义、别解、变形、修正说明之间的分隔 */
const PART_SEPARATOR = ' · ';

type PreviewText = Messages['words']['preview'];

function problemText(problem: LineProblem, text: PreviewText): string {
  switch (problem.reason) {
    case 'no-prompt':
    case 'no-answer':
      return text.problemText[problem.reason];
    case 'too-long':
      return text.problemText.tooLong(text.fields[problem.field], problem.max);
    case 'over-limit':
      return text.problemText.overLimit(problem.max);
  }
}

function entrySubtitle(
  entry: EntryContent,
  repairs: readonly RepairId[],
  text: PreviewText,
): string {
  const parts = [entry.prompt];
  const [, ...alternatives] = entry.answers;
  if (alternatives.length > 0) parts.push(text.alternatives(alternatives.join(LIST_SEPARATOR)));
  if (entry.linkedForms.length > 0) {
    parts.push(text.linkedForms(entry.linkedForms.join(LIST_SEPARATOR)));
  }
  for (const repair of repairs) parts.push(text.repairs[repair]);
  return parts.join(PART_SEPARATOR);
}

interface PreviewRowProps {
  readonly line: PreviewLine;
  readonly text: PreviewText;
  readonly onLocate: (line: LineLocation) => void;
}

function PreviewRow({ line, text, onLocate }: PreviewRowProps) {
  const { messages } = useI18n();
  const locate = (): void => {
    onLocate(line);
  };
  switch (line.kind) {
    case 'entry': {
      const { entry, repairs } = line;
      const hasBadges = entry.verbForm !== null || repairs.length > 0;
      return (
        <ListRow
          title={entry.answers[0]}
          titleLang="de"
          subtitle={entrySubtitle(entry, repairs, text)}
          leading={<span className={styles.lineNumber}>{line.number}</span>}
          {...(hasBadges
            ? {
                trailing: (
                  <>
                    {entry.verbForm !== null && (
                      <Badge tone="tint" size="sm">
                        {messages.entry.verbForm[entry.verbForm.kind]}
                      </Badge>
                    )}
                    {repairs.length > 0 && (
                      <Badge tone="warning" size="sm">
                        {text.repaired}
                      </Badge>
                    )}
                  </>
                ),
              }
            : {})}
        />
      );
    }
    case 'duplicate':
      return (
        <ListRow
          title={line.source.trim()}
          subtitle={text.duplicate(line.original)}
          detail={text.line(line.number)}
          leading={
            <span className={styles.warningIcon}>
              <Copy size={componentGeometry.iconMd} />
            </span>
          }
          onAction={locate}
        />
      );
    case 'error':
      return (
        <ListRow
          title={line.source.trim()}
          subtitle={problemText(line.problem, text)}
          detail={text.line(line.number)}
          leading={
            <span className={styles.dangerIcon}>
              <CircleAlert size={componentGeometry.iconMd} />
            </span>
          }
          onAction={locate}
        />
      );
  }
}

interface WordListPreviewProps {
  readonly result: ParsedWordList | null;
  /** 结果落后于编辑器中的文本（正在解析） */
  readonly isPending: boolean;
  /** 点击有问题的行：在编辑器中选中这一行 */
  readonly onLocate: (line: LineLocation) => void;
}

/** F-064 逐行预览：识别出的词条、未识别的行与重复的行 */
export function WordListPreview({ result, isPending, onLocate }: WordListPreviewProps) {
  const { messages } = useI18n();
  const text = messages.words.preview;
  const headingId = useId();
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [limit, setLimit] = useState(PREVIEW_PAGE_SIZE);

  const counts = result?.counts ?? null;
  const issueCount = counts === null ? 0 : counts.problems + counts.duplicates;
  // 问题全部改好后自动回到“全部”
  const activeFilter: PreviewFilter = issueCount === 0 ? 'all' : filter;
  const groups = messages.words.groups;
  const page = useMemo(
    () => (result === null ? null : previewPage(result.lines, groups, activeFilter, limit)),
    [result, groups, activeFilter, limit],
  );
  const hasLines = page !== null && page.total > 0;
  const remaining = page === null ? 0 : page.total - page.shown;

  return (
    <section
      className={styles.preview}
      aria-labelledby={headingId}
      aria-busy={isPending}
      data-pending={isPending ? '' : undefined}
    >
      <div className={styles.previewHeader}>
        <Heading level={2} id={headingId} className={styles.previewTitle}>
          {text.header}
        </Heading>
        <span className={styles.updating} aria-hidden={!isPending}>
          {text.updating}
        </span>
      </div>

      {counts === null || !hasLines ? (
        <p className={styles.previewEmpty}>{text.empty}</p>
      ) : (
        <>
          <div className={styles.summary}>
            <p className={styles.summaryText}>
              {text.summary(counts.entries, counts.chapters, counts.lessons)}
            </p>
            <div className={styles.badges}>
              {counts.problems > 0 && (
                <Badge tone="danger">{text.problemCount(counts.problems)}</Badge>
              )}
              {counts.duplicates > 0 && (
                <Badge tone="warning">{text.duplicateCount(counts.duplicates)}</Badge>
              )}
              {issueCount === 0 && <Badge tone="success">{text.noProblems}</Badge>}
            </div>
          </div>

          {issueCount > 0 && (
            <SegmentedControl
              label={text.filterLabel}
              size="sm"
              items={[
                { id: 'all', label: text.all },
                { id: 'problems', label: text.problems(issueCount) },
              ]}
              selectedKey={activeFilter}
              onSelectionChange={(key) => {
                setFilter(key);
                setLimit(PREVIEW_PAGE_SIZE);
              }}
            />
          )}

          {page.sections.map((section) => (
            <ListGroup
              key={section.key}
              header={messages.entry.section(section.chapter, section.lesson)}
              headingLevel={3}
            >
              {section.lines.map((line) => (
                <PreviewRow key={line.number} line={line} text={text} onLocate={onLocate} />
              ))}
            </ListGroup>
          ))}

          {remaining > 0 && (
            <Button
              variant="tinted"
              className={styles.showMore}
              onPress={() => {
                setLimit((current) => current + PREVIEW_PAGE_SIZE);
              }}
            >
              {text.showMore(Math.min(remaining, PREVIEW_PAGE_SIZE))}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
