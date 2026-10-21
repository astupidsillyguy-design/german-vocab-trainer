import { useEffect, useRef } from 'react';
import { useGlass } from './GlassContext';
import styles from './Glass.module.css';

/**
 * 全屏动态壁纸：玻璃折射与模糊的采样源。
 * CSS 档显示静态渐变；WebGL 档在其上叠一张低分辨率画布，画面流动，引擎第一帧完成后淡入。
 */
export function GlassWallpaper() {
  const { engine } = useGlass();
  const elementRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    const canvas = canvasRef.current;
    if (engine === null || element === null || canvas === null) return undefined;
    return engine.attachWallpaper({ element, canvas });
  }, [engine]);

  return (
    <div ref={elementRef} className={styles.wallpaper} data-glass-wallpaper="" aria-hidden>
      {engine !== null && <canvas ref={canvasRef} className={styles.wallpaperCanvas} />}
    </div>
  );
}
