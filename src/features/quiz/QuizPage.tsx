import { Archive, BookOpenText, RotateCcw } from 'lucide-react';
import { useId, useLayoutEffect } from 'react';
import { componentGeometry } from '../../design/tokens';
import { currentQuestion, currentResponse, type Entry, type QuizSession } from '../../domain';
import { useI18n } from '../../i18n';
import { Button, EmptyState, NavigationBar, Surface, toast, useSizeClass } from '../../ui';
import { LibraryLoading, useLibraryState } from '../library';
import { useAppNavigation } from '../navigation';
import { AnswerForm } from './AnswerForm';
import { useQuizState, useQuizStore } from './context';
import { QuestionCard } from './QuestionCard';
import { QuizHeader } from './QuizHeader';
import { POOL_SCOPE } from './QuizStore';
import { RoundResult } from './RoundResult';
import styles from './QuizPage.module.css';

/** 测验页（F-010 – F-021）：没有进行中的测验时自动用待测库开始；待测库为空时引导去词表页 */
export function QuizPage() {
  const library = useLibraryState();
  const quiz = useQuizState();
  if (library.status === 'loading' || quiz.status === 'loading') {
    return (
      <>
        <QuizNavigationBar session={null} />
        <LibraryLoading />
      </>
    );
  }
  if (quiz.session === null) {
    return (
      <QuizStarter pool={library.library.pool} hasArchive={library.library.archive.length > 0} />
    );
  }
  return <QuizView session={quiz.session} />;
}

interface QuizNavigationBarProps {
  readonly session: QuizSession | null;
}

/** F-014 重开：不再二次确认，而是立即重开并在通知上提供“撤销” */
function QuizNavigationBar({ session }: QuizNavigationBarProps) {
  const { messages } = useI18n();
  const quiz = useQuizStore();
  const restart = (): void => {
    const previous = quiz.restart();
    toast.success({
      title: messages.quiz.restarted,
      description: messages.quiz.restartedDescription,
      action: {
        label: messages.common.undo,
        onAction: () => {
          quiz.replace(previous);
        },
      },
    });
  };
  return (
    <NavigationBar
      title={messages.nav.quiz}
      largeTitle={false}
      trailing={
        session === null ? undefined : (
          <Button
            size="sm"
            variant="glass"
            leadingIcon={<RotateCcw size={componentGeometry.iconSm} aria-hidden />}
            onPress={restart}
          >
            {messages.quiz.restart}
          </Button>
        )
      }
    />
  );
}

interface QuizStarterProps {
  readonly pool: readonly Entry[];
  readonly hasArchive: boolean;
}

/** F-021 / F-038：待测库为空时显示引导；否则立即开始（在绘制之前，不闪现空状态） */
function QuizStarter({ pool, hasArchive }: QuizStarterProps) {
  const { messages } = useI18n();
  const text = messages.quiz.empty;
  const quiz = useQuizStore();
  const navigation = useAppNavigation();
  const isEmpty = pool.length === 0;

  useLayoutEffect(() => {
    // 开发模式下效果会执行两次：已经开始了就不再重开
    if (!isEmpty && quiz.getState().session === null) quiz.start(pool, POOL_SCOPE);
  }, [isEmpty, pool, quiz]);

  return (
    <>
      <QuizNavigationBar session={null} />
      {isEmpty && (
        <Surface material="regular" radius="xl" elevation={1} className={styles.emptyCard}>
          <EmptyState
            icon={<BookOpenText size={componentGeometry.iconLg} aria-hidden />}
            title={text.title}
            description={hasArchive ? text.archiveDescription : text.description}
            actions={
              <>
                <Button
                  variant="filled"
                  onPress={() => {
                    navigation.navigate('words');
                  }}
                >
                  {text.words}
                </Button>
                {hasArchive && (
                  <Button
                    variant="tinted"
                    leadingIcon={<Archive size={componentGeometry.iconMd} aria-hidden />}
                    onPress={() => {
                      navigation.navigate('archive');
                    }}
                  >
                    {text.archive}
                  </Button>
                )}
              </>
            }
          />
        </Surface>
      )}
    </>
  );
}

interface QuizViewProps {
  readonly session: QuizSession;
}

function QuizView({ session }: QuizViewProps) {
  const promptId = useId();
  const sizeClass = useSizeClass();
  const question = currentQuestion(session);
  return (
    <>
      <QuizNavigationBar session={session} />
      <div className={styles.page} data-size-class={sizeClass}>
        {question === null ? (
          <RoundResult key={`${session.id}:${String(session.round)}`} session={session} />
        ) : (
          <>
            <QuizHeader session={session} />
            <Surface material="regular" radius="xl" elevation={1} className={styles.card}>
              {/* 换题时题面重新挂载以播放弹出动画；输入框不重新挂载 */}
              <div
                key={`${session.id}:${String(session.round)}:${String(session.index)}`}
                className={styles.questionPop}
              >
                <QuestionCard question={question} promptId={promptId} />
              </div>
              <AnswerForm
                session={session}
                question={question}
                response={currentResponse(session)}
                promptId={promptId}
              />
            </Surface>
          </>
        )}
      </div>
    </>
  );
}
