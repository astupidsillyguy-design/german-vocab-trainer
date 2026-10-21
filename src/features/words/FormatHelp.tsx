import { useI18n, type Messages } from '../../i18n';
import { Disclosure } from '../../ui';
import styles from './WordsPage.module.css';

type HelpRuleId = keyof Messages['words']['help']['rules'];

/** 规则的显示顺序（与原版格式说明一致，补充了章节、变形与非中文释义的写法） */
const HELP_RULES = [
  'groups',
  'noun',
  'special',
  'verb',
  'modifier',
  'phrase',
  'verbForm',
  'separator',
] as const satisfies readonly HelpRuleId[];

interface FormatHelpProps {
  readonly isExpanded: boolean;
  readonly onExpandedChange: (isExpanded: boolean) => void;
}

/** F-061 格式说明 */
export function FormatHelp({ isExpanded, onExpandedChange }: FormatHelpProps) {
  const { messages } = useI18n();
  const help = messages.words.help;
  return (
    <Disclosure
      title={help.title}
      subtitle={help.subtitle}
      headingLevel={2}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      <dl className={styles.rules}>
        {HELP_RULES.map((id) => {
          const rule = help.rules[id];
          return (
            <div key={id} className={styles.rule}>
              <dt className={styles.ruleLabel}>{rule.label}</dt>
              <dd className={styles.ruleFormat}>{rule.format}</dd>
              <dd className={styles.ruleExample}>
                <code>{rule.example}</code>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className={styles.footnote}>{help.footnote}</p>
    </Disclosure>
  );
}
