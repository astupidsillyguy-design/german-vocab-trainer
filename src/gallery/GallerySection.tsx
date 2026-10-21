import { useId, type ReactNode } from 'react';
import styles from './DesignGallery.module.css';

interface GallerySectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** 设计系统展示页的一个分区：标题即该区域的无障碍名称。 */
export function GallerySection({ title, children }: GallerySectionProps) {
  const headingId = useId();
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}
