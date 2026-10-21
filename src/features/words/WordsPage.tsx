import { useMemo, useRef, useState } from 'react';
import {
  formatWordList,
  isSamePool,
  replacePool,
  type Entry,
  type LineLocation,
  type ParsedWordList,
} from '../../domain';
import { useI18n } from '../../i18n';
import {
  AlertDialog,
  Badge,
  Button,
  NavigationBar,
  Surface,
  TextArea,
  toast,
  useReducedMotion,
  useSizeClass,
} from '../../ui';
import { LibraryLoading, snapshotUndoAction, useLibraryState, useLibraryStore } from '../library';
import { useAppNavigation } from '../navigation';
import { POOL_SCOPE, useQuizStore } from '../quiz';
import { FormatHelp } from './FormatHelp';
import { selectRange } from './locate';
import { useWordListDraft } from './useWordListDraft';
import { useWordListPreview } from './useWordListPreview';
import { WordListPreview } from './WordListPreview';
import styles from './WordsPage.module.css';

/** 编辑器的可见行数（宽屏两栏布局下由样式撑满视口高度） */
const EDITOR_ROWS = 12;
const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/u;
const SAVE_KEYS = { apple: '⌘ Enter', other: 'Ctrl + Enter' } as const;

function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && APPLE_PLATFORM.test(navigator.platform);
}

/** 词表页（F-060）：编辑、逐行预览，保存后整体替换待测库并开始测验 */
export function WordsPage() {
  const { messages } = useI18n();
  const state = useLibraryState();
  if (state.status === 'loading') {
    return (
      <>
        <NavigationBar title={messages.nav.wordList} largeTitle />
        <LibraryLoading />
      </>
    );
  }
  return <WordListWorkspace pool={state.library.pool} />;
}

interface WordListWorkspaceProps {
  readonly pool: readonly Entry[];
}

function WordListWorkspace({ pool }: WordListWorkspaceProps) {
  const { messages } = useI18n();
  const text = messages.words;
  const store = useLibraryStore();
  const quiz = useQuizStore();
  const navigation = useAppNavigation();
  const sizeClass = useSizeClass();
  const reducedMotion = useReducedMotion();
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const savedText = useMemo(() => formatWordList(pool), [pool]);
  const draft = useWordListDraft(savedText);
  const preview = useWordListPreview(draft.text);

  const [error, setError] = useState<string | null>(null);
  // 对话框关闭动画期间仍要显示内容，因此“是否打开”与“待确认的结果”分开保存
  const [partial, setPartial] = useState<ParsedWordList | null>(null);
  const [isPartialOpen, setPartialOpen] = useState(false);
  const [isDiscardOpen, setDiscardOpen] = useState(false);
  // 格式说明：第一次使用（待测库为空）时在宽屏默认展开；手机与平板上它位于编辑器上方，默认收起
  const [help, setHelp] = useState(() => ({
    isExpanded: pool.length === 0 && sizeClass === 'expanded',
    isTouched: false,
  }));

  const shortcut = isApplePlatform() ? SAVE_KEYS.apple : SAVE_KEYS.other;
  const showShortcut = sizeClass !== 'compact';
  const description = showShortcut
    ? `${text.editorDescription} ${text.shortcutHint(shortcut)}`
    : text.editorDescription;

  const locate = (line: LineLocation): void => {
    const editor = editorRef.current;
    if (editor !== null) selectRange(editor, line, { smooth: !reducedMotion });
  };

  /** 最新文本的解析结果：预览已是最新时直接复用，否则同步解析（按行缓存，只需几毫秒） */
  const latestResult = (): ParsedWordList =>
    !preview.isPending && preview.result !== null
      ? preview.result
      : preview.parser.parse(draft.text);

  const commit = (parsed: ParsedWordList): void => {
    // 读取 store 中的最新状态：连按两次保存时，第二次会看到第一次的结果，不会再拍一份快照
    const before = store.getState().library;
    if (isSamePool(before.pool, parsed.entries)) {
      // 词表没有变化：进行中的测验继续，不打乱进度
      draft.reset();
      quiz.resumeOrStart(before.pool, POOL_SCOPE);
      navigation.navigate('quiz');
      return;
    }
    const saving = store.update((library) => replacePool(library, parsed.entries), {
      snapshot: 'replace-pool',
    });
    if (store.getState().library === before) {
      // 修改没有生效（词库尚不可写），留在本页，草稿保持不变
      saving.catch(() => undefined);
      toast.error({ title: text.failed });
      return;
    }
    // 修改已同步生效：立即用新的待测库开始测验，写入存储在后台完成（失败时由全局通知提示重试）
    draft.reset();
    quiz.start(store.getState().library.pool, POOL_SCOPE);
    navigation.navigate('quiz');
    void saving.then(
      ({ snapshotId }) => {
        toast.success({
          title: text.saved(parsed.counts.entries),
          description: text.savedDescription,
          ...(snapshotId === null
            ? {}
            : {
                action: snapshotUndoAction(store, snapshotId, {
                  label: messages.common.undo,
                  done: text.undone,
                  failed: messages.settings.snapshots.failed,
                }),
              }),
        });
      },
      () => {
        toast.error({ title: text.failed });
      },
    );
  };

  /** F-067 保存并测试；F-068 一个词条都没有识别出时提示，并留在编辑器中 */
  const save = (): void => {
    const parsed = latestResult();
    if (parsed.counts.entries === 0) {
      setError(text.empty.description);
      toast.error({ title: text.empty.title, description: text.empty.description });
      editorRef.current?.focus();
      return;
    }
    if (parsed.counts.problems > 0) {
      setPartial(parsed);
      setPartialOpen(true);
      return;
    }
    commit(parsed);
  };

  return (
    <>
      <NavigationBar
        title={messages.nav.wordList}
        largeTitle
        trailing={
          // 主操作放在导航栏：编辑器再长、键盘弹出时也随手可及（同 iOS 的“完成 / 保存”）
          <Button size="sm" variant="filled" onPress={save}>
            {text.actions.save}
          </Button>
        }
      />
      <div className={styles.page} data-size-class={sizeClass}>
        {draft.hasConflict && (
          <Surface
            as="section"
            material="regular"
            radius="lg"
            elevation={1}
            className={styles.conflict}
            role="status"
          >
            <p className={styles.conflictTitle}>{text.conflict.title}</p>
            <p className={styles.conflictMessage}>{text.conflict.message}</p>
            <div className={styles.conflictActions}>
              <Button size="sm" variant="tinted" onPress={draft.reset}>
                {text.conflict.load}
              </Button>
              <Button size="sm" variant="plain" onPress={draft.keep}>
                {text.conflict.keep}
              </Button>
            </div>
          </Surface>
        )}

        <div className={styles.layout}>
          <div className={styles.help}>
            <p className={styles.intro}>{text.intro}</p>
            <FormatHelp
              isExpanded={help.isExpanded}
              onExpandedChange={(isExpanded) => {
                setHelp({ isExpanded, isTouched: true });
              }}
            />
          </div>

          <div className={styles.editor}>
            <TextArea
              inputRef={editorRef}
              className={styles.editorField}
              label={text.editorLabel}
              description={description}
              placeholder={text.placeholder}
              rows={EDITOR_ROWS}
              monospace
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="none"
              value={draft.text}
              onChange={(value) => {
                setError(null);
                // 宽屏：第一次输入后自动收起格式说明，让预览出现在编辑器旁边（用户手动展开过则不动）
                if (
                  draft.text === '' &&
                  value !== '' &&
                  sizeClass === 'expanded' &&
                  !help.isTouched
                ) {
                  setHelp({ isExpanded: false, isTouched: false });
                }
                draft.setText(value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  save();
                }
              }}
              isInvalid={error !== null}
              {...(error === null ? {} : { errorMessage: error })}
            />
            <div className={styles.status}>
              {draft.isDirty && (
                <Badge tone="warning" size="sm">
                  {text.unsaved}
                </Badge>
              )}
              <Button
                variant="plain"
                size="sm"
                className={styles.discard}
                isDisabled={!draft.isDirty}
                onPress={() => {
                  setDiscardOpen(true);
                }}
              >
                {text.actions.discard}
              </Button>
            </div>
          </div>

          <div className={styles.previewColumn}>
            <WordListPreview
              result={preview.result}
              isPending={preview.isPending}
              onLocate={locate}
            />
          </div>
        </div>
      </div>

      <AlertDialog
        isOpen={isPartialOpen}
        onOpenChange={setPartialOpen}
        title={partial === null ? '' : text.partial.title(partial.counts.problems)}
        confirmLabel={text.partial.confirm}
        cancelLabel={text.partial.cancel}
        onConfirm={() => {
          if (partial !== null) commit(partial);
        }}
      >
        {partial === null ? null : text.partial.message(partial.counts.entries)}
      </AlertDialog>

      <AlertDialog
        isOpen={isDiscardOpen}
        onOpenChange={setDiscardOpen}
        title={text.discard.title}
        confirmLabel={text.discard.confirm}
        tone="destructive"
        onConfirm={() => {
          setError(null);
          draft.reset();
        }}
      >
        {text.discard.message}
      </AlertDialog>
    </>
  );
}
