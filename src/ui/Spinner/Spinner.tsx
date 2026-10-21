import { spinner } from '../../design/tokens';
import { useI18n } from '../../i18n';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  readonly size?: 'sm' | 'md' | 'lg';
  /** 读屏文案，默认“加载中…” */
  readonly label?: string;
  /** 作为其他控件的一部分时设为 true，由外层负责无障碍语义 */
  readonly decorative?: boolean;
}

const SPOKES = Array.from({ length: spinner.spokeCount }, (_, index) => ({
  index,
  // 从“头部”到“尾部”线性变淡，形成拖尾
  opacity: 1 - (index / spinner.spokeCount) * (1 - spinner.minSpokeOpacity),
}));

/** iOS 风格活动指示器：8 根辐条按离散步进旋转。 */
export function Spinner({ size = 'md', label, decorative = false }: SpinnerProps) {
  const { messages } = useI18n();
  const semantics = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'status', 'aria-label': label ?? messages.common.loading } as const);

  return (
    <span
      {...semantics}
      className={styles.spinner}
      data-size={size}
      style={{
        '--spoke-count': spinner.spokeCount,
        '--spoke-width-ratio': spinner.spokeWidthRatio,
        '--spoke-length-ratio': spinner.spokeLengthRatio,
      }}
    >
      {SPOKES.map(({ index, opacity }) => (
        <span
          key={index}
          className={styles.spoke}
          style={{ '--spoke-index': index, '--spoke-opacity': opacity }}
        />
      ))}
    </span>
  );
}
