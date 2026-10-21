import { Archive, Layers, RefreshCw } from 'lucide-react';
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { componentGeometry } from '../../design/tokens';
import {
  answerKey,
  archiveStats,
  filterEntries,
  groupEntries,
  isInGroup,
  pruneSelection,
  selectedSections,
  toggleChapter,
  toggleLesson,
  type ArchiveGroup,
  type ArchiveTarget,
  type Entry,
  type Library,
} from '../../domain';
import { useI18n } from '../../i18n';
import {
  AlertDialog,
  announce,
  Button,
  EmptyState,
  IconButton,
  NavigationBar,
  SearchField,
  Surface,
} from '../../ui';
import { LibraryLoading, useLibraryState } from '../library';
import { useAppNavigation } from '../navigation';
import { useSyncSheet } from '../sync';
import { useArchiveActions } from './actions';
import { ChapterList } from './ChapterList';
import { EditEntrySheet } from './EditEntrySheet';
import { useArchiveExpansion } from './expansion';
import { findFocusTarget, focusKey, removalFallbacks } from './focus';
import { ManageButton, ModeBanner } from './ManageControls';
import type { ManageMode } from './manageMode';
import { RenameSheet } from './RenameSheet';
import { ArchiveViewContext, type ArchiveView } from './view';
import styles from './ArchivePage.module.css';

/** 搜索结果不超过这么多词时课时也全部展开；更多时只展开章节，避免一次渲染上千行 */
const SEARCH_EXPAND_LIMIT = 200;
const NOTHING_SELECTED: ReadonlySet<string> = new Set();

let lastSerial = 0;
function nextSerial(): number {
  lastSerial += 1;
  return lastSerial;
}

interface EditRequest {
  readonly entry: Entry;
  /** 每次打开加一：面板以它为 key 重新挂载，输入从词条的当前内容开始 */
  readonly serial: number;
}

interface RenameRequest {
  readonly group: ArchiveGroup;
  readonly serial: number;
}

interface RemoveRequest {
  readonly target: ArchiveTarget;
  readonly title: string;
  readonly message: string;
  /** 删除后依次尝试聚焦的相邻删除按钮 */
  readonly fallbacks: readonly string[];
}

/** 退出模式时焦点所在的元素，以及它随模式消失后焦点该交给哪个入口按钮 */
interface ModeExit {
  readonly focused: Element | null;
  readonly entry: 'manage' | 'combo';
}

/** 归档库（F-040 – F-055）：统计、搜索、两级折叠、排序、按课时测试、组合测试与管理 */
export function ArchivePage() {
  const { messages } = useI18n();
  const state = useLibraryState();
  if (state.status === 'loading') {
    return (
      <>
        <NavigationBar title={messages.nav.archive} largeTitle />
        <LibraryLoading />
      </>
    );
  }
  if (state.library.archive.length === 0) return <EmptyArchive />;
  return <ArchiveBrowser library={state.library} />;
}

/** 导航栏上的“设备同步”入口（F-070） */
function SyncButton() {
  const { messages } = useI18n();
  const sync = useSyncSheet();
  return (
    <IconButton
      icon={<RefreshCw size={componentGeometry.iconSm} />}
      label={messages.sync.title}
      size="sm"
      onPress={() => {
        sync.open();
      }}
    />
  );
}

/** 首次使用：说明归档从哪里来，引导去测验，或从已有词库的设备同步过来 */
function EmptyArchive() {
  const { messages } = useI18n();
  const text = messages.archive.empty;
  const navigation = useAppNavigation();
  const sync = useSyncSheet();
  return (
    <>
      <NavigationBar title={messages.nav.archive} largeTitle />
      <EmptyState
        icon={<Archive size={componentGeometry.iconLg} />}
        title={text.title}
        description={text.description}
        actions={
          <>
            <Button
              variant="filled"
              onPress={() => {
                navigation.navigate('quiz');
              }}
            >
              {text.action}
            </Button>
            <Button
              variant="glass"
              leadingIcon={<RefreshCw size={componentGeometry.iconSm} aria-hidden />}
              onPress={() => {
                sync.open();
              }}
            >
              {messages.sync.openFromEmpty}
            </Button>
          </>
        }
      />
    </>
  );
}

function ArchiveBrowser({ library }: { readonly library: Library }) {
  const { locale, messages } = useI18n();
  const text = messages.archive;
  const reorderHintId = useId();
  const manageHintId = useId();

  const [mode, setMode] = useState<ManageMode>('none');
  const [isCombo, setCombo] = useState(false);
  const [selected, setSelected] = useState(NOTHING_SELECTED);
  const [query, setQuery] = useState('');
  // 输入框立即响应；过滤与重新分组在后台渲染，连续输入时会被新的关键词打断
  const deferredQuery = useDeferredValue(query);
  const searchKey = answerKey(deferredQuery);
  const isSearching = searchKey !== '';

  const { archive, order } = library;
  const allGroups = useMemo(() => groupEntries(archive, order), [archive, order]);
  const matches = useMemo(() => filterEntries(archive, deferredQuery), [archive, deferredQuery]);
  const groups = useMemo(
    () => (isSearching ? groupEntries(matches, order) : allGroups),
    [isSearching, matches, order, allGroups],
  );
  const stats = useMemo(() => archiveStats(archive), [archive]);
  // 课时被删除或改名后，已选中的旧课时自动失效
  const liveSelection = useMemo(() => pruneSelection(selected, allGroups), [selected, allGroups]);
  const expansion = useArchiveExpansion(groups, searchKey, matches.length <= SEARCH_EXPAND_LIMIT);
  // 改名成功后章节 / 课时以新名称重新挂载，面板关闭时把焦点交给新的铅笔按钮
  const renamedTo = useRef<string | null>(null);
  const actions = useArchiveActions({
    onRenamed: (from, to) => {
      expansion.follow(from, to);
      renamedTo.current = focusKey(to);
    },
  });
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'short' }),
    [locale],
  );

  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const [isEditOpen, setEditOpen] = useState(false);
  const [renameRequest, setRenameRequest] = useState<RenameRequest | null>(null);
  const [isRenameOpen, setRenameOpen] = useState(false);
  // 对话框关闭动画期间仍要显示内容，因此“是否打开”与“待确认的内容”分开保存
  const [removeRequest, setRemoveRequest] = useState<RemoveRequest | null>(null);
  const [isRemoveOpen, setRemoveOpen] = useState(false);

  // 退出模式时，铅笔、删除按钮、复选框与“完成”都会消失；焦点若在其上，就交还给对应的入口按钮
  const manageRef = useRef<HTMLButtonElement>(null);
  const comboRef = useRef<HTMLButtonElement>(null);
  const modeExit = useRef<ModeExit | null>(null);
  const rememberFocus = (entry: ModeExit['entry']): void => {
    modeExit.current = { focused: document.activeElement, entry };
  };
  useLayoutEffect(() => {
    const exit = modeExit.current;
    modeExit.current = null;
    if (exit === null || exit.focused?.isConnected === true) return;
    (exit.entry === 'manage' ? manageRef : comboRef).current?.focus();
  }, [mode, isCombo]);

  const changeMode = (next: ManageMode): void => {
    rememberFocus('manage');
    setMode(next);
    if (next === 'none') return;
    setCombo(false);
    announce(next === 'edit' ? text.manage.editBanner : text.manage.deleteBanner);
  };

  const toggleCombo = (): void => {
    const next = !isCombo;
    rememberFocus('combo');
    setCombo(next);
    setMode('none');
    if (next) announce(text.combo.hint);
    else setSelected(NOTHING_SELECTED);
  };

  // Esc 退出管理或组合模式；已被其他控件处理的 Esc（关闭面板、清空搜索）不再处理
  const isModal = mode !== 'none' || isCombo;
  const onEscape = useEffectEvent((): void => {
    rememberFocus(isCombo ? 'combo' : 'manage');
    setMode('none');
    setCombo(false);
    setSelected(NOTHING_SELECTED);
  });
  useEffect(() => {
    if (!isModal) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onEscape();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isModal]);

  const view: ArchiveView = {
    mode,
    isCombo,
    canReorder: !isSearching && !isCombo && mode !== 'delete',
    selected: liveSelection,
    expansion,
    actions,
    reorderHintId,
    formatDate: (iso) => dateFormat.format(new Date(iso)),
    openEdit: (entry) => {
      setEditRequest({ entry, serial: nextSerial() });
      setEditOpen(true);
    },
    openRename: (group) => {
      setRenameRequest({ group, serial: nextSerial() });
      setRenameOpen(true);
    },
    openRemove: (target, name) => {
      if (target.kind === 'entry') {
        setRemoveRequest({
          target,
          title: text.remove.entryTitle,
          message: text.remove.entryMessage(name),
          fallbacks: removalFallbacks(groups, target),
        });
      } else {
        const count = archive.filter((entry) => isInGroup(entry, target)).length;
        setRemoveRequest({
          target,
          title: target.kind === 'chapter' ? text.remove.chapterTitle : text.remove.lessonTitle,
          message: text.remove.groupMessage(name, count),
          fallbacks: removalFallbacks(groups, target),
        });
      }
      setRemoveOpen(true);
    },
    toggleLesson: (chapter, lesson) => {
      setSelected(toggleLesson(liveSelection, chapter, lesson));
    },
    toggleChapter: (chapter) => {
      const group = allGroups.find((item) => item.chapter === chapter);
      if (group !== undefined) setSelected(toggleChapter(liveSelection, group));
    },
  };

  return (
    <ArchiveViewContext value={view}>
      <NavigationBar
        title={messages.nav.archive}
        largeTitle
        trailing={
          <>
            <SyncButton />
            <ManageButton
              ref={manageRef}
              mode={mode}
              onChange={changeMode}
              describedBy={manageHintId}
            />
          </>
        }
      />
      <div className={styles.page}>
        {/* 搜索时改为显示结果数；作为状态区域，读屏会礼貌地读出变化 */}
        <p className={styles.stats} role="status">
          {isSearching
            ? text.resultCount(matches.length)
            : text.stats(stats.entries, stats.chapters)}
        </p>

        <div className={styles.toolbar}>
          <SearchField
            className={styles.search}
            label={text.search.label}
            placeholder={text.search.placeholder}
            value={query}
            onChange={setQuery}
          />
          <Button
            ref={comboRef}
            variant={isCombo ? 'filled' : 'glass'}
            leadingIcon={<Layers size={componentGeometry.iconSm} />}
            onPress={toggleCombo}
          >
            {isCombo ? text.combo.exit : text.combo.toggle}
          </Button>
        </div>

        <ModeBanner mode={mode} isCombo={isCombo} onChange={changeMode} />

        {groups.length === 0 ? (
          <EmptyState
            title={text.noResults.title}
            description={text.noResults.description(deferredQuery.trim())}
          />
        ) : (
          <ChapterList groups={groups} />
        )}

        {isCombo && (
          <Surface material="chrome" radius="xl" elevation={3} className={styles.comboBar}>
            <span className={styles.comboCount}>{text.combo.selected(liveSelection.size)}</span>
            <Button
              variant="filled"
              isDisabled={liveSelection.size === 0}
              onPress={() => {
                actions.test(selectedSections(allGroups, liveSelection));
              }}
            >
              {text.combo.start}
            </Button>
          </Surface>
        )}

        <span id={reorderHintId} hidden>
          {text.reorder.hint}
        </span>
        <span id={manageHintId} hidden>
          {text.manage.hint}
        </span>
      </div>

      {editRequest !== null && (
        <EditEntrySheet
          key={editRequest.serial}
          entry={editRequest.entry}
          isOpen={isEditOpen}
          onOpenChange={setEditOpen}
          onSave={(change) => actions.edit(editRequest.entry.id, change)}
          fallbackFocus={() =>
            findFocusTarget([focusKey({ kind: 'entry', id: editRequest.entry.id })])
          }
        />
      )}
      {renameRequest !== null && (
        <RenameSheet
          key={renameRequest.serial}
          group={renameRequest.group}
          isOpen={isRenameOpen}
          onOpenChange={setRenameOpen}
          onSave={(name) => {
            renamedTo.current = null;
            return actions.rename(renameRequest.group, name);
          }}
          fallbackFocus={() =>
            findFocusTarget(renamedTo.current === null ? [] : [renamedTo.current])
          }
        />
      )}
      <AlertDialog
        isOpen={isRemoveOpen}
        onOpenChange={setRemoveOpen}
        title={removeRequest?.title ?? ''}
        confirmLabel={text.remove.confirm}
        tone="destructive"
        onConfirm={() => {
          if (removeRequest !== null) actions.remove(removeRequest.target);
        }}
        fallbackFocus={() => findFocusTarget(removeRequest?.fallbacks ?? []) ?? manageRef.current}
      >
        {removeRequest?.message ?? null}
      </AlertDialog>
    </ArchiveViewContext>
  );
}
