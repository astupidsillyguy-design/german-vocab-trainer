import { Copy, ScanLine } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import {
  isPairingCode,
  normalizePairingInput,
  pairingQrText,
  readScannedPairing,
} from '../../shared/pairing';
import {
  SYNC_ROLES,
  type SyncPhase,
  type SyncProblem,
  type SyncRole,
  type SyncSession,
  type SyncState,
} from '../../sync';
import { Button, SegmentedControl, Spinner, TextField, copyToClipboard } from '../../ui';
import { formatPairingCode, spokenDigits } from './format';
import { PairingQr } from './PairingQr';
import { canUseCamera } from './qrDetector';
import { QrScanner } from './QrScanner';
import styles from './SyncSheet.module.css';

type PairingPhase = Extract<SyncPhase, { readonly name: 'pairing' }>;

const OTHER_ROLE = { send: 'receive', receive: 'send' } as const satisfies Record<
  SyncRole,
  SyncRole
>;

/** 改为另一个角色即可解决的问题 */
const ROLE_PROBLEMS = new Set<SyncProblem>(['same-role', 'peer-same-role']);

interface PairingViewProps {
  readonly session: SyncSession;
  readonly state: SyncState;
  readonly phase: PairingPhase;
  readonly initialCode: string | null;
}

/**
 * 配对（F-071 – F-073）：显示本机配对码（可复制、二维码），或输入 / 扫描对方的配对码。
 * 任意一方输入对方的配对码即可连接；角色在连接前可以随时更改。
 */
export function PairingView({ session, state, phase, initialCode }: PairingViewProps) {
  const { messages } = useI18n();
  const text = messages.sync;
  const [input, setInput] = useState(initialCode ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isScanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [hasCamera] = useState(canUseCamera);
  const ownCodeId = useId();
  const joinId = useId();
  const isJoining = phase.joining !== null;
  const isReady = phase.code !== null;

  const connect = (raw: string): void => {
    const code = normalizePairingInput(raw);
    if (!isPairingCode(code)) {
      setInputError(text.pairing.invalid);
      return;
    }
    if (code === phase.code) {
      setInputError(text.pairing.ownCode);
      return;
    }
    setInputError(null);
    session.join(code);
  };

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    connect(input);
  };

  const scanned = (value: string): void => {
    const result = readScannedPairing(value);
    if (result.kind !== 'code') {
      setScanMessage(result.kind === 'legacy' ? text.scanner.legacy : text.scanner.invalid);
      return;
    }
    setScanning(false);
    setScanMessage(null);
    setInput(result.code);
    connect(result.code);
  };

  const roleItems = SYNC_ROLES.map((role) => ({
    id: role,
    label: role === 'send' ? text.role.sendShort : text.role.receiveShort,
  }));

  return (
    <>
      <SegmentedControl
        label={text.role.label}
        items={roleItems}
        selectedKey={state.role}
        isDisabled={isJoining}
        onSelectionChange={(role) => {
          session.setRole(role);
        }}
      />

      {state.problem !== null && (
        <ProblemNotice
          problem={state.problem}
          role={state.role}
          onRetry={() => {
            session.restart();
          }}
          onSwitchRole={(role) => {
            session.setRole(role);
          }}
        />
      )}

      <section className={styles.section} aria-labelledby={ownCodeId}>
        <h3 id={ownCodeId} className={styles.sectionTitle} tabIndex={-1} data-view-title>
          {text.pairing.codeHeader}
        </h3>
        {phase.code === null ? (
          state.problem === null && (
            <div className={styles.status}>
              <Spinner size="sm" decorative />
              <span>{text.pairing.preparing}</span>
            </div>
          )
        ) : (
          <div className={styles.codeCard}>
            <div className={styles.codeRow}>
              <span
                className={styles.code}
                role="img"
                aria-label={text.pairing.codeLabel(spokenDigits(phase.code))}
              >
                {formatPairingCode(phase.code)}
              </span>
              <Button
                size="sm"
                variant="tinted"
                leadingIcon={<Copy size={componentGeometry.iconSm} />}
                aria-label={text.pairing.copyLabel}
                onPress={() => {
                  if (phase.code === null) return;
                  void copyToClipboard(phase.code, {
                    done: text.pairing.copied,
                    failed: text.pairing.copyFailed,
                  });
                }}
              >
                {text.pairing.copy}
              </Button>
            </div>
            <PairingQr
              text={pairingQrText(window.location.href, phase.code)}
              label={text.pairing.qrLabel}
            />
            <p className={styles.note}>{text.pairing.hint}</p>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby={joinId}>
        <h3 id={joinId} className={styles.sectionTitle}>
          {text.pairing.joinHeader}
        </h3>
        {isJoining ? (
          <div className={styles.status}>
            <Spinner size="sm" decorative />
            <span role="status">{text.pairing.joining(formatPairingCode(phase.joining))}</span>
            <Button
              size="sm"
              variant="glass"
              onPress={() => {
                session.cancelConnect();
              }}
            >
              {messages.common.cancel}
            </Button>
          </div>
        ) : isScanning ? (
          <QrScanner
            message={scanMessage}
            onScan={scanned}
            onClose={() => {
              setScanning(false);
              setScanMessage(null);
            }}
          />
        ) : (
          <form className={styles.joinForm} onSubmit={submit} noValidate>
            <TextField
              className={styles.codeField}
              label={text.pairing.codeField}
              placeholder={text.pairing.codePlaceholder}
              inputMode="numeric"
              autoComplete="off"
              value={input}
              onChange={(value) => {
                setInput(value);
                setInputError(null);
              }}
              isDisabled={!isReady}
              {...(inputError === null ? {} : { isInvalid: true, errorMessage: inputError })}
            />
            <div className={styles.buttons}>
              <Button type="submit" variant="filled" isDisabled={!isReady}>
                {text.pairing.connect}
              </Button>
              {hasCamera && (
                <Button
                  variant="glass"
                  leadingIcon={<ScanLine size={componentGeometry.iconSm} />}
                  isDisabled={!isReady}
                  onPress={() => {
                    setScanning(true);
                  }}
                >
                  {text.pairing.scan}
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
    </>
  );
}

interface ProblemNoticeProps {
  readonly problem: SyncProblem;
  readonly role: SyncRole;
  readonly onRetry: () => void;
  readonly onSwitchRole: (role: SyncRole) => void;
}

/** 配对中出现的问题与解决办法（重试、改为另一个角色） */
function ProblemNotice({ problem, role, onRetry, onSwitchRole }: ProblemNoticeProps) {
  const { messages } = useI18n();
  const text = messages.sync;
  const other = OTHER_ROLE[role];
  return (
    <div className={styles.problem} role="alert">
      <p className={styles.problemText}>{text.problems[problem]}</p>
      {problem === 'signaling-unavailable' && (
        <Button size="sm" variant="tinted" onPress={onRetry}>
          {text.retry}
        </Button>
      )}
      {ROLE_PROBLEMS.has(problem) && (
        <Button
          size="sm"
          variant="tinted"
          onPress={() => {
            onSwitchRole(other);
          }}
        >
          {text.switchTo[other]}
        </Button>
      )}
    </div>
  );
}
