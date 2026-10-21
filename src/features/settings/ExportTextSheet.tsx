import { Copy, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import { formatWordList, type CollectionName, type Library } from '../../domain';
import { useI18n } from '../../i18n';
import { downloadBlob, fileTimestamp } from '../../shared/download';
import { Button, SegmentedControl, Sheet, TextArea, copyToClipboard, toast } from '../../ui';
import styles from './SettingsPage.module.css';

/** 归档库在前：纯文本备份最常用于保存已经学过的词 */
const EXPORT_COLLECTIONS = ['archive', 'pool'] as const satisfies readonly CollectionName[];
const PREVIEW_ROWS = 12;

export function wordListFileName(collection: CollectionName, date: Date): string {
  return `german-vocab-trainer-${collection}-${fileTimestamp(date)}.txt`;
}

interface ExportTextSheetProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly library: Library;
}

/** 导出纯文本（F-056）：与词表页相同的格式，可以复制或下载为 .txt，也可以直接粘贴回词表 */
export function ExportTextSheet({ isOpen, onOpenChange, library }: ExportTextSheetProps) {
  const { messages } = useI18n();
  const text = messages.settings.exportText;
  const [collection, setCollection] = useState<CollectionName>('archive');
  const entries = library[collection];
  const content = useMemo(
    () => formatWordList(library[collection], collection === 'archive' ? library.order : undefined),
    [library, collection],
  );
  const isEmpty = entries.length === 0;

  const download = (): void => {
    downloadBlob(
      wordListFileName(collection, new Date()),
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
    );
    toast.success({ title: text.downloaded });
  };

  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} title={text.title}>
      <div className={styles.sheetBody}>
        <SegmentedControl
          label={text.collection}
          items={EXPORT_COLLECTIONS.map((id) => ({ id, label: text.collections[id] }))}
          selectedKey={collection}
          onSelectionChange={setCollection}
        />
        {isEmpty ? (
          <p className={styles.note}>{text.empty(text.collections[collection])}</p>
        ) : (
          <TextArea
            label={text.preview}
            description={text.summary(entries.length)}
            value={content}
            isReadOnly
            monospace
            rows={PREVIEW_ROWS}
          />
        )}
        <div className={styles.buttons}>
          <Button
            variant="tinted"
            isDisabled={isEmpty}
            leadingIcon={<Copy size={componentGeometry.iconSm} aria-hidden />}
            onPress={() => {
              void copyToClipboard(content, { done: text.copied, failed: text.copyFailed });
            }}
          >
            {text.copy}
          </Button>
          <Button
            variant="filled"
            isDisabled={isEmpty}
            leadingIcon={<Download size={componentGeometry.iconSm} aria-hidden />}
            onPress={download}
          >
            {text.download}
          </Button>
        </div>
        <p className={styles.note}>{text.footer}</p>
      </div>
    </Sheet>
  );
}
