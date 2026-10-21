import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { Spinner } from '../../ui';
import styles from './LibraryLoading.module.css';

/** 本地数据通常几十毫秒内即可读完；超过这个时间才显示加载指示，避免一闪而过 */
export const LOADING_INDICATOR_DELAY_MS = 300;

/** 词库加载中的占位 */
export function LibraryLoading() {
  const { messages } = useI18n();
  const [isVisible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, LOADING_INDICATOR_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className={styles.loading} aria-busy="true">
      {isVisible && <Spinner size="lg" label={messages.common.loading} />}
    </div>
  );
}
