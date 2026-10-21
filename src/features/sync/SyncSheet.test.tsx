import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSyncPayload, normalizeLibrary, type Entry, type Library } from '../../domain';
import { pairingQrText } from '../../shared/pairing';
import { SyncSession, type SyncRole, type SyncState } from '../../sync';
import type { LibraryStore } from '../../storage';
import { expectNoAxeViolations } from '../../test/axe';
import { makeLesson } from '../../test/entries';
import { createTestStoreWith, renderWithProviders } from '../../test/library';
import { createMemorySyncNetwork, settle, type MemorySyncNetwork } from '../../test/sync';
import { ToastRegion } from '../../ui';
import { useSyncSheet } from './context';
import type { SyncEnvironmentFactory } from './environment';

const ARCHIVED_AT = '2025-02-01T09:00:00.000Z';
const REMOTE_DEVICE = 'iPhone · Safari';

function libraryOf(archive: readonly Entry[]): Library {
  return normalizeLibrary({
    pool: [],
    archive: archive.map((entry) => ({ ...entry, archivedAt: ARCHIVED_AT })),
    order: [],
  });
}

/** 本机：第 1 讲两个词 */
const LOCAL = libraryOf(makeLesson('A1', '第1讲', ['柜子', '桌子']));
const LOCAL_PROMPTS = ['柜子', '桌子'];
/** 另一台设备：第 1 讲三个词、第 2 讲两个词 */
const REMOTE = libraryOf([
  ...makeLesson('A1', '第1讲', ['猫', '狗', '鸟']),
  ...makeLesson('A1', '第2讲', ['工作', '学习']),
]);

const sessions: SyncSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function OpenSync() {
  const sync = useSyncSheet();
  return (
    <button
      type="button"
      onClick={() => {
        sync.open();
      }}
    >
      打开同步
    </button>
  );
}

/** 另一台设备：直接驱动同步会话（与面板使用同一套内存网络） */
function remoteSession(network: MemorySyncNetwork, role: SyncRole): SyncSession {
  const session = new SyncSession({
    role,
    signaling: network.signaling,
    peers: network.peers.factory,
    device: REMOTE_DEVICE,
  });
  sessions.push(session);
  return session;
}

/** 等待内存网络中的所有消息投递完毕（期间的界面更新包在 act 中） */
async function flush(): Promise<void> {
  await act(settle);
}

async function remoteCode(session: SyncSession): Promise<string> {
  await flush();
  const { phase } = session.getState();
  if (phase.name !== 'pairing' || phase.code === null) throw new Error('对方还没有配对码');
  return phase.code;
}

function phaseOf(session: SyncSession): SyncState['phase']['name'] {
  return session.getState().phase.name;
}

function reviewedPrompts(session: SyncSession): string[] {
  const { phase } = session.getState();
  if (phase.name !== 'reviewing') throw new Error(`对方没有进入预览：${phase.name}`);
  return phase.payload.entries.map(({ prompt }) => prompt);
}

const promptsOf = (store: LibraryStore): string[] =>
  store.getState().library.archive.map(({ prompt }) => prompt);

interface Opened {
  readonly user: UserEvent;
  readonly store: LibraryStore;
  readonly sheet: HTMLElement;
}

async function renderSync(library: Library, environment: SyncEnvironmentFactory) {
  const user = userEvent.setup();
  const store = createTestStoreWith(library);
  await store.load();
  renderWithProviders(
    <>
      <OpenSync />
      <ToastRegion />
    </>,
    { store, sync: environment },
  );
  return { user, store };
}

async function openSheet(library: Library, environment: SyncEnvironmentFactory): Promise<Opened> {
  const { user, store } = await renderSync(library, environment);
  await user.click(screen.getByRole('button', { name: '打开同步' }));
  return { user, store, sheet: await screen.findByRole('dialog', { name: '设备同步' }) };
}

async function chooseRole({ user, sheet }: Opened, role: SyncRole): Promise<void> {
  const name = role === 'send' ? /发送到其他设备/u : /从其他设备接收/u;
  await user.click(within(sheet).getByRole('button', { name }));
}

/** 读出面板上显示的本机配对码 */
async function ownCode(sheet: HTMLElement): Promise<string> {
  const code = await within(sheet).findByRole('img', { name: /本机配对码/u });
  return (code.getAttribute('aria-label') ?? '').replace(/\D/gu, '');
}

async function typeCode({ user, sheet }: Opened, code: string): Promise<void> {
  const field = within(sheet).getByRole('textbox', { name: '对方的配对码' });
  await user.clear(field);
  await user.type(field, code);
  await user.click(within(sheet).getByRole('button', { name: '连接' }));
}

async function expectConnected(sheet: HTMLElement): Promise<void> {
  await flush();
  expect(await within(sheet).findByText(`已连接到 ${REMOTE_DEVICE}`)).toBeInTheDocument();
}

/** 本机作为接收方，等待发送方输入本机的配对码 */
async function connectAsReceiver(opened: Opened, network: MemorySyncNetwork) {
  await chooseRole(opened, 'receive');
  const code = await ownCode(opened.sheet);
  const sender = remoteSession(network, 'send');
  await remoteCode(sender);
  sender.join(code);
  await expectConnected(opened.sheet);
  return sender;
}

/** 本机作为发送方，输入接收方的配对码连接 */
async function connectAsSender(opened: Opened, network: MemorySyncNetwork) {
  const receiver = remoteSession(network, 'receive');
  const code = await remoteCode(receiver);
  await chooseRole(opened, 'send');
  await ownCode(opened.sheet);
  await typeCode(opened, code);
  await expectConnected(opened.sheet);
  return receiver;
}

/** 对方推送整个归档库，本机进入预览 */
async function receiveRemote(opened: Opened, sender: SyncSession): Promise<HTMLElement> {
  sender.push(buildSyncPayload(REMOTE, { mode: 'full' }));
  await flush();
  return within(opened.sheet).findByRole('button', { name: '接收并覆盖' });
}

describe('SyncSheet：接收（F-070 / F-078 – F-080）', () => {
  it('先选择角色，再显示配对码与二维码', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    expect(within(opened.sheet).getByText('这台设备要做什么？')).toBeInTheDocument();
    await expectNoAxeViolations();

    await chooseRole(opened, 'receive');
    expect(await ownCode(opened.sheet)).toMatch(/^\d{6}$/u);
    expect(within(opened.sheet).getByRole('img', { name: '配对二维码' })).toBeInTheDocument();
    expect(within(opened.sheet).getByRole('radio', { name: '接收' })).toBeChecked();
    await expectNoAxeViolations();
  });

  it('预览收到的数据，确认后写入；结果可以撤销', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    const sender = await connectAsReceiver(opened, network);
    expect(within(opened.sheet).getByText('等待对方推送…')).toBeInTheDocument();

    const accept = await receiveRemote(opened, sender);
    expect(within(opened.sheet).getByText('覆盖整个归档库')).toBeInTheDocument();
    expect(within(opened.sheet).getByText('收到 5 个词 · 2 个课时')).toBeInTheDocument();
    expect(within(opened.sheet).getByText('新课时 · 2 词')).toBeInTheDocument();
    // 确认之前不写入
    expect(promptsOf(opened.store)).toEqual(LOCAL_PROMPTS);
    await expectNoAxeViolations();

    await opened.user.click(accept);
    await flush();
    await waitFor(() => {
      expect(promptsOf(opened.store)).toEqual(REMOTE.archive.map(({ prompt }) => prompt));
    });
    expect(await screen.findAllByText('已接收 5 个词')).not.toHaveLength(0);
    expect(sender.getState().outcome?.result).toBe('applied');

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(promptsOf(opened.store)).toEqual(LOCAL_PROMPTS);
    });
    expect(within(opened.sheet).getByText('已撤销同步')).toBeInTheDocument();
    expect(within(opened.sheet).queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
  });

  it('拒绝后本机词库不变，对方收到拒绝', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    const sender = await connectAsReceiver(opened, network);
    await receiveRemote(opened, sender);

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '拒绝' }));
    await flush();
    expect(await within(opened.sheet).findByText('已拒绝这次同步')).toBeInTheDocument();
    expect(promptsOf(opened.store)).toEqual(LOCAL_PROMPTS);
    expect(sender.getState().outcome?.result).toBe('declined');
  });

  it('等待确认时关闭面板需要确认；对方断开后刚才的结果仍可撤销', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    const sender = await connectAsReceiver(opened, network);
    const accept = await receiveRemote(opened, sender);

    await opened.user.keyboard('{Escape}');
    const alert = await screen.findByRole('alertdialog', { name: '中止同步？' });
    await opened.user.click(within(alert).getByRole('button', { name: '取消' }));
    expect(screen.getByRole('dialog', { name: '设备同步' })).toBeInTheDocument();

    await opened.user.click(accept);
    await flush();
    await within(opened.sheet).findByRole('button', { name: '撤销' });

    sender.disconnect();
    await flush();
    expect(await within(opened.sheet).findByText('对方已断开连接')).toBeInTheDocument();
    await opened.user.click(within(opened.sheet).getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(promptsOf(opened.store)).toEqual(LOCAL_PROMPTS);
    });
  });

  it('等待确认时断开需要确认，确认后通知对方，可以重新配对', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    const sender = await connectAsReceiver(opened, network);
    await receiveRemote(opened, sender);

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '断开连接' }));
    const alert = await screen.findByRole('alertdialog', { name: '中止同步？' });
    await opened.user.click(within(alert).getByRole('button', { name: '中止并断开' }));
    await flush();
    expect(await within(opened.sheet).findByText('已断开连接')).toBeInTheDocument();
    expect(phaseOf(sender)).toBe('ended');
    expect(promptsOf(opened.store)).toEqual(LOCAL_PROMPTS);

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '重新配对' }));
    expect(await ownCode(opened.sheet)).toMatch(/^\d{6}$/u);
  });
});

describe('SyncSheet：发送（F-071 / F-072 / F-076）', () => {
  it('校验输入的配对码', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    await chooseRole(opened, 'send');
    const code = await ownCode(opened.sheet);

    await typeCode(opened, '12345');
    expect(within(opened.sheet).getByText('请输入 6 位数字')).toBeInTheDocument();
    await typeCode(opened, code);
    expect(within(opened.sheet).getByText(/这是本机的配对码/u)).toBeInTheDocument();
  });

  it('输入对方的配对码连接，推送整个归档库', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    const receiver = await connectAsSender(opened, network);
    expect(within(opened.sheet).getByRole('radio', { name: '整个归档库' })).toBeChecked();
    await expectNoAxeViolations();

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '推送 2 个词' }));
    await flush();
    expect(reviewedPrompts(receiver)).toEqual(LOCAL_PROMPTS);
    expect(within(opened.sheet).getByText('已送达，等待对方确认…')).toBeInTheDocument();

    receiver.decline();
    await flush();
    expect(await within(opened.sheet).findByText('对方拒绝了这次同步')).toBeInTheDocument();
  });

  it('按课时推送：只发送所选课时', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(REMOTE, network.environment);
    const receiver = await connectAsSender(opened, network);

    await opened.user.click(within(opened.sheet).getByRole('radio', { name: '按课时' }));
    expect(within(opened.sheet).getByRole('button', { name: '推送 0 个词' })).toBeDisabled();
    await opened.user.click(within(opened.sheet).getByRole('checkbox', { name: /^第2讲/u }));
    expect(within(opened.sheet).getByRole('checkbox', { name: /^A1/u })).toBePartiallyChecked();
    expect(within(opened.sheet).getByText('已选 1 个课时 · 2 个词')).toBeInTheDocument();
    await expectNoAxeViolations();

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '推送 2 个词' }));
    await flush();
    expect(reviewedPrompts(receiver)).toEqual(['工作', '学习']);

    receiver.accept(() => Promise.resolve('snapshot'));
    await flush();
    expect(await within(opened.sheet).findByText('对方已接收 2 个词')).toBeInTheDocument();
  });
});

describe('SyncSheet：配对问题（F-075）', () => {
  it('两台设备选择了相同的角色：可以改为另一个角色', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    const other = remoteSession(network, 'receive');
    const code = await remoteCode(other);
    await chooseRole(opened, 'receive');
    await ownCode(opened.sheet);
    await typeCode(opened, code);
    await flush();

    const alert = await within(opened.sheet).findByRole('alert');
    expect(alert).toHaveTextContent('两台设备选择了相同的角色');
    await opened.user.click(within(alert).getByRole('button', { name: '改为发送' }));
    expect(within(opened.sheet).getByRole('radio', { name: '发送' })).toBeChecked();
  });

  it('配对服务器不可用：显示原因，可以重试', async () => {
    const network = createMemorySyncNetwork();
    network.signaling.unavailable = true;
    const opened = await openSheet(LOCAL, network.environment);
    await chooseRole(opened, 'receive');
    await flush();
    const alert = await within(opened.sheet).findByRole('alert');
    expect(alert).toHaveTextContent('无法连接配对服务器');

    network.signaling.unavailable = false;
    await opened.user.click(within(alert).getByRole('button', { name: '重试' }));
    expect(await ownCode(opened.sheet)).toMatch(/^\d{6}$/u);
  });

  it('浏览器不支持 WebRTC 时说明原因', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, () => ({ ...network.environment(), peers: null }));
    expect(within(opened.sheet).getByText('此浏览器无法直连其他设备')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('关闭面板时结束会话，释放信令连接', async () => {
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    await chooseRole(opened, 'receive');
    await ownCode(opened.sheet);
    expect(network.signaling.openConnections).toBe(1);

    await opened.user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '设备同步' })).not.toBeInTheDocument();
    });
    expect(network.signaling.openConnections).toBe(0);
  });
});

describe('SyncSheet：配对链接与扫码（F-073）', () => {
  it('从带配对码的地址打开：直接打开面板，选择角色后自动连接', async () => {
    const network = createMemorySyncNetwork();
    const receiver = remoteSession(network, 'receive');
    const code = await remoteCode(receiver);
    window.history.replaceState(null, '', `/?sync=${code}#/archive`);

    const { user, store } = await renderSync(LOCAL, network.environment);
    const sheet = await screen.findByRole('dialog', { name: '设备同步' });
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/archive');
    expect(within(sheet).getByText(/选择角色后，将连接到配对码/u)).toBeInTheDocument();

    await chooseRole({ user, store, sheet }, 'send');
    await expectConnected(sheet);
    expect(phaseOf(receiver)).toBe('connected');
  });

  it('扫描对方的二维码后连接，并关闭相机', async () => {
    const network = createMemorySyncNetwork();
    const receiver = remoteSession(network, 'receive');
    const code = await remoteCode(receiver);
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(() => Promise.resolve(stream)) },
    });
    // 第一个二维码不是配对码：提示后继续扫描
    const detected = ['https://example.com/', pairingQrText('https://example.com/app/', code)];
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        static getSupportedFormats(): Promise<string[]> {
          return Promise.resolve(['qr_code']);
        }
        detect(): Promise<{ rawValue: string }[]> {
          const rawValue = detected.shift();
          return Promise.resolve(rawValue === undefined ? [] : [{ rawValue }]);
        }
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    const opened = await openSheet(LOCAL, network.environment);
    await chooseRole(opened, 'send');
    await ownCode(opened.sheet);
    await opened.user.click(within(opened.sheet).getByRole('button', { name: '扫描二维码' }));
    expect(await within(opened.sheet).findByText('这不是配对二维码')).toBeInTheDocument();
    await waitFor(() => {
      expect(phaseOf(receiver)).toBe('connected');
    });
    await expectConnected(opened.sheet);
    expect(stop).toHaveBeenCalled();
  });

  it('无法使用相机时说明原因，可以改为手动输入', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.reject(new DOMException('denied', 'NotAllowedError'))),
      },
    });
    const network = createMemorySyncNetwork();
    const opened = await openSheet(LOCAL, network.environment);
    await chooseRole(opened, 'send');
    await ownCode(opened.sheet);
    await opened.user.click(within(opened.sheet).getByRole('button', { name: '扫描二维码' }));
    expect(await within(opened.sheet).findByRole('alert')).toHaveTextContent('无法使用相机');

    await opened.user.click(within(opened.sheet).getByRole('button', { name: '停止扫描' }));
    expect(within(opened.sheet).getByRole('textbox', { name: '对方的配对码' })).toBeEnabled();
  });
});
