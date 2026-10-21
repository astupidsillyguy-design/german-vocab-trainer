import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button, Spinner } from '../../ui';
import { createQrDetector, type QrDetector } from './qrDetector';
import styles from './SyncSheet.module.css';

/** 两次识别之间的间隔：足够跟手，又不会让手机持续满负荷 */
const SCAN_INTERVAL_MS = 200;

type ScannerStatus = 'starting' | 'scanning' | 'denied' | 'unavailable';

interface QrScannerProps {
  /** 识别到任意二维码时调用（是否为配对码由调用方判断） */
  readonly onScan: (text: string) => void;
  readonly onClose: () => void;
  /** 识别结果不是配对码时的提示 */
  readonly message: string | null;
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * 扫描配对二维码（F-073）：打开后置相机，定时识别画面；卸载时关闭相机。
 * 用户拒绝授权或没有相机时给出说明，可以改为手动输入。
 */
export function QrScanner({ onScan, onClose, message }: QrScannerProps) {
  const { messages } = useI18n();
  const text = messages.sync.scanner;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const report = useEffectEvent((value: string) => {
    onScan(value);
  });

  useEffect(() => {
    // 用 AbortController 记录是否已卸载：异步步骤之间随时可能关闭扫码
    const lifetime = new AbortController();
    const isClosed = (): boolean => lifetime.signal.aborted;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const open = async (): Promise<QrDetector | null> => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (isClosed()) {
          stopTracks(media);
          return null;
        }
        stream = media;
        const detect = await createQrDetector();
        const video = videoRef.current;
        if (isClosed() || video === null) return null;
        video.srcObject = media;
        await video.play();
        return detect;
      } catch (error) {
        if (!isClosed()) {
          const denied = error instanceof DOMException && error.name === 'NotAllowedError';
          setStatus(denied ? 'denied' : 'unavailable');
        }
        return null;
      }
    };

    const scan = async (detect: QrDetector, video: HTMLVideoElement): Promise<void> => {
      const value = await detect(video).catch(() => null);
      if (isClosed()) return;
      if (value !== null) report(value);
      timer = setTimeout(() => void scan(detect, video), SCAN_INTERVAL_MS);
    };

    void open().then((detect) => {
      const video = videoRef.current;
      if (detect === null || video === null || isClosed()) return;
      setStatus('scanning');
      void scan(detect, video);
    });

    return () => {
      lifetime.abort();
      if (timer !== null) clearTimeout(timer);
      if (stream !== null) stopTracks(stream);
    };
  }, []);

  const problem = status === 'denied' || status === 'unavailable' ? text[status] : null;

  return (
    <div className={styles.scanner}>
      <div className={styles.viewfinder}>
        <video ref={videoRef} className={styles.video} aria-label={text.label} muted playsInline />
        <span className={styles.frame} aria-hidden />
        {status === 'starting' && (
          <span className={styles.viewfinderOverlay}>
            <Spinner label={text.starting} />
          </span>
        )}
      </div>
      {problem === null ? (
        <p className={styles.note} role="status">
          {message ?? text.hint}
        </p>
      ) : (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <Button variant="glass" onPress={onClose}>
        {text.stop}
      </Button>
    </div>
  );
}
