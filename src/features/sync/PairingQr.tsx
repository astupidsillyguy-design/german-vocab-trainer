import { useMemo } from 'react';
import { qrMatrix } from './qr';
import styles from './SyncSheet.module.css';

interface PairingQrProps {
  readonly text: string;
  readonly label: string;
}

/** 配对二维码：纯 SVG，任何尺寸都清晰，深浅颜色固定（相机需要足够的对比度） */
export function PairingQr({ text, label }: PairingQrProps) {
  const { size, path } = useMemo(() => qrMatrix(text), [text]);
  const box = `0 0 ${String(size)} ${String(size)}`;
  return (
    <svg
      className={styles.qr}
      viewBox={box}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={path} />
    </svg>
  );
}
