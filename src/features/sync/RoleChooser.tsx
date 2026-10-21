import { Download, Upload } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import type { SyncRole } from '../../sync';
import { ListGroup, ListRow } from '../../ui';
import { formatPairingCode } from './format';
import styles from './SyncSheet.module.css';

interface RoleChooserProps {
  readonly onChoose: (role: SyncRole) => void;
  /** 从配对链接打开时，选择角色后将连接的配对码 */
  readonly pendingCode: string | null;
}

/** 第一步（F-070）：明确选择这台设备是发送方还是接收方，避免误把空的词库推送出去 */
export function RoleChooser({ onChoose, pendingCode }: RoleChooserProps) {
  const { messages } = useI18n();
  const text = messages.sync.role;
  return (
    <div className={styles.body}>
      <ListGroup header={text.prompt} headingLevel={3} footer={text.footer}>
        <ListRow
          title={text.send}
          subtitle={text.sendDescription}
          leading={<Upload size={componentGeometry.iconMd} />}
          showChevron
          onAction={() => {
            onChoose('send');
          }}
        />
        <ListRow
          title={text.receive}
          subtitle={text.receiveDescription}
          leading={<Download size={componentGeometry.iconMd} />}
          showChevron
          onAction={() => {
            onChoose('receive');
          }}
        />
      </ListGroup>
      {pendingCode !== null && (
        <p className={styles.note}>{text.pendingCode(formatPairingCode(pendingCode))}</p>
      )}
    </div>
  );
}
