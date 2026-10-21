import { Info } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../ui';
import styles from './SettingsPage.module.css';

/** 关于：版本号（构建时由 package.json 注入）与数据去向说明 */
export function AboutSection() {
  const { messages } = useI18n();
  const text = messages.settings.about;
  return (
    <ListGroup header={text.header} footer={text.privacy}>
      <ListRow
        title={messages.meta.appName}
        leading={<Info size={componentGeometry.iconMd} />}
        trailing={<span className={styles.value}>{text.version(__APP_VERSION__)}</span>}
      />
    </ListGroup>
  );
}
