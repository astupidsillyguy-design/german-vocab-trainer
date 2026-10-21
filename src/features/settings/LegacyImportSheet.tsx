import { Copy, Download, FileJson, HardDrive } from 'lucide-react';
import { useMemo, useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import {
  convertLegacy,
  LIMITS,
  readLegacyFile,
  type LegacyDump,
  type LegacyFileError,
  type LegacyStats,
  type Library,
} from '../../domain';
import { useI18n } from '../../i18n';
import { downloadBlob } from '../../shared/download';
import { readLegacyStorage } from '../../storage';
import {
  Button,
  Disclosure,
  FileTrigger,
  ListGroup,
  ListRow,
  SegmentedControl,
  Sheet,
  TextArea,
  copyToClipboard,
  toast,
} from '../../ui';
import {
  hasLegacyContent,
  importLegacy,
  isLibraryEmpty,
  snapshotUndoAction,
  useLibraryStore,
  type LegacyImportMode,
  type LegacyImportResult,
} from '../library';
import {
  LEGACY_EXPORTER_FILE_NAME,
  legacyConsoleSnippet,
  legacyExporterHtml,
} from './legacyExporter';
import styles from './SettingsPage.module.css';

/** 远大于任何真实的原版数据（几千词约 1 MB），超过时不读取，避免卡住页面 */
export const LEGACY_FILE_MAX_BYTES = 50_000_000;
const LEGACY_IMPORT_MODES = ['merge', 'replace'] as const satisfies readonly LegacyImportMode[];
const SNIPPET_ROWS = 6;

type Source =
  | { readonly kind: 'local'; readonly dump: LegacyDump }
  | { readonly kind: 'file'; readonly name: string; readonly dump: LegacyDump };

type SourceError = LegacyFileError | 'too-large' | 'read-failed';

interface LegacyImportSheetProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly library: Library;
}

/**
 * 导入旧版数据（F-005）：本机（同一网址下）的原版数据，或导出工具生成的 JSON 文件。
 * 先预览再导入；词库已有内容时可以选择合并或替换，导入前自动保存快照，可以撤销。
 * 每次打开都是新的状态（由调用方通过 key 重新挂载）。
 */
export function LegacyImportSheet({ isOpen, onOpenChange, library }: LegacyImportSheetProps) {
  const { locale, messages } = useI18n();
  const store = useLibraryStore();
  const text = messages.settings.legacy;
  const [local] = useState(readLegacyStorage);
  const [source, setSource] = useState<Source | null>(() =>
    local === null ? null : { kind: 'local', dump: local },
  );
  const [error, setError] = useState<SourceError | null>(null);
  const [mode, setMode] = useState<LegacyImportMode>('merge');
  const [isImporting, setImporting] = useState(false);
  const conversion = useMemo(() => (source === null ? null : convertLegacy(source.dump)), [source]);
  const hasWords = !isLibraryEmpty(library);
  const canImport = conversion !== null && hasLegacyContent(conversion) && !isImporting;

  const fail = (reason: SourceError): void => {
    setError(reason);
    setSource(null);
  };

  const selectFile = async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (file === undefined) return;
    if (file.size > LEGACY_FILE_MAX_BYTES) {
      fail('too-large');
      return;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      fail('read-failed');
      return;
    }
    const read = readLegacyFile(content);
    if (!read.ok) {
      fail(read.error);
      return;
    }
    setError(null);
    setSource({ kind: 'file', name: file.name, dump: read.dump });
  };

  const runImport = async (): Promise<void> => {
    if (conversion === null) return;
    setImporting(true);
    let result: LegacyImportResult;
    try {
      result = await importLegacy(store, conversion, hasWords ? mode : 'replace');
    } catch {
      toast.error({ title: text.failed });
      return;
    } finally {
      setImporting(false);
    }
    if (!result.ok) {
      toast.error({ title: text.tooMany(LIMITS.entriesPerCollection) });
      return;
    }
    onOpenChange(false);
    const counts = messages.settings.data.wordCounts(result.added.pool, result.added.archive);
    const undoId = result.snapshotId;
    toast.success({
      title: text.imported,
      description: text.importedDescription(counts, result.duplicates),
      ...(undoId === null
        ? {}
        : {
            action: snapshotUndoAction(store, undoId, {
              label: messages.common.undo,
              done: text.undone,
              failed: text.undoFailed,
            }),
          }),
    });
  };

  const downloadExporter = (): void => {
    downloadBlob(
      LEGACY_EXPORTER_FILE_NAME,
      new Blob([legacyExporterHtml(locale, text.exporter)], { type: 'text/html;charset=utf-8' }),
    );
  };

  const snippet = legacyConsoleSnippet();
  const sourceFooter =
    error !== null ? (
      <span role="alert" className={styles.error}>
        {text.errors[error]}
      </span>
    ) : source?.kind === 'file' ? (
      text.selectedFile(source.name)
    ) : undefined;

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={text.title}
      detent="large"
      actions={
        <Button
          size="sm"
          variant="filled"
          isDisabled={!canImport}
          onPress={() => {
            void runImport();
          }}
        >
          {text.import}
        </Button>
      }
    >
      <div className={styles.sheetBody}>
        <p className={styles.note}>{text.intro}</p>
        <ListGroup header={text.source} headingLevel={3} footer={sourceFooter}>
          {local !== null && (
            <ListRow
              title={text.local}
              subtitle={text.localDescription}
              leading={<HardDrive size={componentGeometry.iconMd} />}
              trailing={
                <Button
                  size="sm"
                  variant="tinted"
                  isDisabled={source?.kind === 'local'}
                  onPress={() => {
                    setError(null);
                    setSource({ kind: 'local', dump: local });
                  }}
                >
                  {source?.kind === 'local' ? text.chosen : text.choose}
                </Button>
              }
            />
          )}
          <ListRow
            title={text.file}
            subtitle={text.fileDescription}
            leading={<FileJson size={componentGeometry.iconMd} />}
            trailing={
              <FileTrigger
                acceptedFileTypes={['application/json', '.json']}
                onSelect={(files) => {
                  void selectFile(files);
                }}
              >
                <Button size="sm" variant="tinted">
                  {text.chooseFile}
                </Button>
              </FileTrigger>
            }
          />
        </ListGroup>

        {conversion !== null && (
          <ListGroup
            header={text.preview}
            headingLevel={3}
            footer={<LegacyNotes stats={conversion.stats} />}
          >
            <ListRow
              title={text.pool}
              trailing={<span className={styles.value}>{text.words(conversion.stats.pool)}</span>}
            />
            <ListRow
              title={text.archive}
              trailing={
                <span className={styles.value}>
                  {text.archiveValue(conversion.stats.archive, conversion.library.order.length)}
                </span>
              }
            />
            {conversion.backup !== null && (
              <ListRow
                title={text.backup}
                trailing={
                  <span className={styles.value}>{text.words(conversion.stats.backup)}</span>
                }
              />
            )}
          </ListGroup>
        )}

        {conversion !== null && hasLegacyContent(conversion) && hasWords && (
          <div className={styles.field}>
            <span className={styles.itemLabel} aria-hidden>
              {text.mode}
            </span>
            <SegmentedControl
              label={text.mode}
              items={LEGACY_IMPORT_MODES.map((id) => ({ id, label: text.modes[id] }))}
              selectedKey={mode}
              onSelectionChange={setMode}
            />
            <p className={styles.note}>{text.modeDescriptions[mode]}</p>
          </div>
        )}

        <Disclosure title={text.help.title} headingLevel={3}>
          <div className={styles.help}>
            <ol className={styles.steps}>
              {text.help.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className={styles.buttons}>
              <Button
                variant="tinted"
                leadingIcon={<Download size={componentGeometry.iconSm} aria-hidden />}
                onPress={downloadExporter}
              >
                {text.help.download}
              </Button>
            </div>
            <p className={styles.note}>{text.help.consoleIntro}</p>
            <TextArea
              label={text.help.consoleLabel}
              value={snippet}
              isReadOnly
              monospace
              rows={SNIPPET_ROWS}
            />
            <div className={styles.buttons}>
              <Button
                variant="tinted"
                leadingIcon={<Copy size={componentGeometry.iconSm} aria-hidden />}
                onPress={() => {
                  void copyToClipboard(snippet, {
                    done: text.help.copied,
                    failed: messages.settings.exportText.copyFailed,
                  });
                }}
              >
                {text.help.copyCode}
              </Button>
            </div>
          </div>
        </Disclosure>
      </div>
    </Sheet>
  );
}

interface LegacyNotesProps {
  readonly stats: LegacyStats;
}

/** 转换时做过的整理，逐条说明（没有时不显示） */
function LegacyNotes({ stats }: LegacyNotesProps) {
  const { messages } = useI18n();
  const text = messages.settings.legacy.notes;
  const notes = [
    stats.pool + stats.archive + stats.backup === 0 ? text.nothing : null,
    stats.bareNouns > 0 ? text.bareNouns(stats.bareNouns) : null,
    stats.synthetic > 0 ? text.synthetic(stats.synthetic) : null,
    stats.rejected > 0 ? text.rejected(stats.rejected) : null,
  ].filter((note) => note !== null);
  if (notes.length === 0) return null;
  return (
    <ul className={styles.notes}>
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}
