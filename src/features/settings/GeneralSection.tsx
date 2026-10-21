import { LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES, useI18n } from '../../i18n';
import { GLASS_TIER_PREFERENCES, ListGroup, ListItem, SegmentedControl, useGlass } from '../../ui';
import styles from './SettingsPage.module.css';

/** 通用：界面语言与玻璃效果。两者都是本机偏好，立即生效，刷新后保留 */
export function GeneralSection() {
  const { locale, messages, setLocale } = useI18n();
  const glass = useGlass();
  const text = messages.settings.general;
  return (
    <ListGroup header={text.header} footer={text.glassFooter(messages.glass.tiers[glass.tier])}>
      <ListItem>
        {/* 可见标签与分段控件的读屏名称相同，不重复朗读 */}
        <span className={styles.itemLabel} aria-hidden>
          {messages.locale.label}
        </span>
        <SegmentedControl
          label={messages.locale.label}
          items={SUPPORTED_LOCALES.map((id) => ({ id, label: LOCALE_NATIVE_NAMES[id] }))}
          selectedKey={locale}
          onSelectionChange={setLocale}
        />
      </ListItem>
      <ListItem>
        <span className={styles.itemLabel} aria-hidden>
          {text.glass}
        </span>
        <SegmentedControl
          label={text.glass}
          items={GLASS_TIER_PREFERENCES.map((id) => ({
            id,
            label: messages.glass.preferences[id],
          }))}
          selectedKey={glass.preference}
          onSelectionChange={glass.setPreference}
        />
      </ListItem>
    </ListGroup>
  );
}
