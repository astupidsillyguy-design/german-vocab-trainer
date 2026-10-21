# 交接文档：德语词汇背记 · 从零重写（当前在阶段 6.7）

> 把这份文档完整发给新的 AI，它就能接着做剩下的任务。更新时间：6.7 进行中。

## 1. 身份与任务

你是世界顶级全栈工程师，也是 Apple 级的交互和图形工程师。任务是从零重写一个本地 Web 应用：德语词汇背记。原版是单文件 `德语词汇背记 - 副本.html。UI 采用 Apple Liquid Glass 风格。用户说中文。

- **流程**：严格按 6 个阶段推进。每个阶段或子步骤结束都要汇报四项：完成了什么、相比原版改进了什么、还剩什么、风险和待确认的事。
- **代码要求**：给完整文件；TypeScript strict，不用 any；不写魔法数字；不重复代码；要有单测和 Playwright 端到端测试。
- **质量底线**：LCP < 2s，交互 < 100ms，Lighthouse ≥ 95；WebGL 只渲染可见区域、失焦时暂停；符合 WCAG AA；支持"减少动态效果"和"降低透明度"；完整键盘操作；防 XSS。

## 2. 进度

- 阶段 1–5 已完成。阶段 6 中 6.1–6.6 已完成。
- **正在做 6.7 设备直连同步（F-070 – F-081）**。做完要发 6.7 汇报，然后做 6.8 收尾。
- 6.8 的内容：F-090、F-093、F-094、PWA、F-095 CSP、Lighthouse、Firefox/WebKit 端到端测试、按路由拆包降低主包体积、保存前的离开保护、清理 PlaceholderPage、编辑面板的焦点处理等。

## 3. 用户已确认的决定

- 删除 F-003、F-004、F-049、F-085、F-066。
- 不加"不会"、跳过、间隔重复。
- 首次使用显示空状态和引导。
- 不改 F-013、F-050、F-067、F-074。
- 名词必须写冠词。
- React 19；界面语言：中、英、德、日。
- 手机用底部 Tab Bar，平板和桌面用侧边栏。
- 主色 #5856D6；只有浅色模式。
- Firefox 不做页面过渡动画。
- Sheet 支持半屏和全屏两档。
- Toast：手机在顶部，桌面在右下。
- 不加震动。
- 快照保留 20 份；撤销窗口 6 秒。
- 扫二维码优先用 BarcodeDetector，不支持时用本地小库（jsqr）。
- MQTT over WebSocket 自己写精简版。
- 同步只同步归档库和归档排序，不同步待测库。
- 同步以 Sheet 形式打开，入口在归档页和设置页。

## 4. FEATURES.md 的 G 组（6.7 完成后全部改为 ✅，并加"6.7 实现说明"）

- F-070：明确选择发送或接收角色（Sheet）
- F-071：复制配对码，用通知代替弹窗
- F-072：输入配对码时校验 6 位数字
- F-073：扫码连接
- F-074：保留公共 MQTT 和 STUN，SignalingAdapter 可替换
- F-075：连接状态补全超时、断开、失败
- F-076：发送端选项用 SegmentedControl，复选框支持半选
- F-077：v3 协议、schema 校验、分片传输（不兼容旧版）
- F-078：接收方预览（修复了原版的远程 XSS）
- F-079：写入时显示真实进度
- F-080：撤销覆盖：基于快照历史，断开后仍可撤销
- F-081：断开和关闭

## 5. 环境

- **项目目录**：沙盒 `/data/german-vocab-trainer`（React 19 + Vite + TS + Vitest + Playwright）。
- **常用命令**：
  - 全量检查：`npm run check`（约 3 分钟，用 nohup 后台跑）
  - 构建：`npm run build`
  - CSS 类型：`npm run css-types`
  - 类型检查：`npx tsc -p tsconfig.app.json --noEmit`（约 60 秒）
  - 格式和检查：`npx prettier --write`、`npx eslint`、`npx stylelint`
  - 单测：`npx vitest run <path> > /tmp/v.log 2>&1`，再用 `sed 's/\x1b\[[0-9;]*m//g'` 去掉颜色后 grep
  - 端到端：`PLAYWRIGHT_CHROMIUM_PATH=/usr/local/bin/chromium npx playwright test --project=desktop-chromium --project=mobile-chromium --reporter=line`（全量约 11 分钟，上次 172 个全部通过）
  - bash 单次最多等 30 秒，长任务放后台再用 wait 查看。
- **ESLint 注意点**：
  - no-magic-numbers：测试文件里关闭；允许 -1、0、1、2、100。
  - no-unnecessary-condition：闭包里修改的变量会被误判，改成用函数读取。
  - react-hooks v7 规则。
  - jsx-a11y：自定义组件的 prop 不能叫 role。
  - 字符串不能 spread。
  - 用 SubmitEvent，不用 FormEvent。
  - exactOptionalPropertyTypes：可选属性用条件 spread 传。
  - erasableSyntaxOnly：不能用构造函数参数属性。
- **stylelint**：间距、字号、圆角只能用 token（padding 简写里不能把 0 和 var 混用）；类名用 camelCase。
- **UI 组件**：都从 `src/ui/index.ts` 导出，包括 Badge、Button（variant 可选 glass/filled/tinted/plain/destructive；size 可选 sm/md/lg；支持 leadingIcon）、IconButton（icon、label、variant、size）、Checkbox、AlertDialog、EmptyState、ListGroup/ListRow、NavigationBar（trailing）、ProgressBar、SegmentedControl、Sheet、Spinner、TextField、toast、announce、copyToClipboard。
  - TextField 要同时传 `isInvalid` 和 `errorMessage`，错误提示才会显示。
- **测试工具**：
  - `src/test/library.tsx` 里的 `renderWithProviders(ui, { store, path, locale, quiz, sync })`。`sync` 省略时用互不相通的内存同步环境。
  - `src/test/sync.ts`：MemorySignaling、MemoryPeers、settle、`createMemorySyncNetwork()`。
  - `src/test/mqtt.ts`：FakeSocket 等 MQTT 测试工具。
  - 无障碍检查：`expectNoAxeViolations`。
  - 端到端 fixtures：expect、expectAccessible、test（自动断言没有控制台错误）；`seed(page, records)`。
  - 页面里的 toast 在端到端测试中是 listitem 角色。

## 6. 写回用户电脑

- **MCP 服务器**：`本地工作区固定地址`。
- **工具**：
  - `read_text_file{relative_path, max_lines}`
  - `write_text_file{relative_path, content, expected_sha256}`
- **路径**：前缀是 `german-vocab-trainer/`。
- **写入规则**：
  - content 内联传完整文件内容（也可以用 arguments_file_path 传 JSON 文件）。
  - 覆盖已有文件前，先用 `read_text_file(max_lines: 1)` 取 sha，作为 `expected_sha256`；新文件传 null。
  - 写入被拦截时，停下来报告原始错误，不要绕过。
- **辅助文件**：
  - `/data/chk.py <path> <sha>`：内部清单目录要从 s6-6 改成 s6-7。
  - `/data/todo.py`
  - `/data/mcp-args/written-sha.json`（已有 420 条记录）
  - 本阶段清单：`/data/mcp-args/s6-7/index.txt`
- **转义**：JSON 里的反斜杠要写两遍；bash 输出偶尔出现乱码，用 python 的 ascii() 确认原文。

## 7. 6.7 已完成的部分

- **依赖**：uqr@0.1.3、jsqr@1.4.0。
- **src/shared/hash.ts**；数据 schema 加了 `variant`。
- **src/domain**：`selection.ts` 从 archive 移进来；新增 `syncPayload.ts`（buildSyncPayload、applySyncPayload）。
- **src/sync/ 传输层**：
  - constants：MQTT_BROKER_URL、DEFAULT_ICE_SERVERS、SYNC_TIMEOUTS、新增的 BROADCAST_CHANNEL_PREFIX。
  - pairing、device、mqtt/packets、mqtt/MqttClient。
  - signaling：mqttSignaling 和 broadcastSignaling。
  - messages：v3 协议和 schema 白名单。
  - transfer（分片）、peer、webrtc、SyncSession、index。
  - 共 75 个单测，全部通过。
  - 实测连 broker.emqx.io 成功：连接约 1.2 秒，往返约 125 毫秒。
- **src/features/sync/ 界面**：
  - environment、defaultEnvironment（开发模式下读 `window.__gvtSyncTest`）、context（`useSyncSheet().open()`）。
  - SyncProvider：懒加载 SyncSheet；地址里带 `?sync=` 时直接打开面板，然后清理地址。
  - SyncSheet：选角色 → 配对 → 直连 → 推送或预览确认 → 断开；忙碌时关闭或断开需要先确认。
  - RoleChooser、PairingView、SessionViews、SendView、LessonPicker、ReceiveView、SyncPreview（纯文本渲染）。
  - 二维码和扫码：qr、PairingQr、qrDetector、QrScanner；另有 format、progress、样式文件 `SyncSheet.module.css`。
- **四语言文案**：`sync` 段已补全；`settings.data.sync` 为"设备同步…"。
- **design tokens**：新增 `pairingQrSize` 176 和 `scannerSize` 280。
- **clipboard 移动**：从 `features/settings/clipboard.ts` 移到 `src/ui/Toast/clipboard.ts`。
- **最近一轮**：
  - **入口**：
    - App.tsx 里，在 NavigationProvider 内用 `<SyncProvider>` 包住 `<AppShell/>`。
    - 归档页：导航栏加了 IconButton "设备同步"（RefreshCw 图标，放在"管理"按钮左边）；空状态加了按钮"从其他设备同步"。
    - 设置页的"数据"分组加了一行"设备同步…"。
  - **CSP**：`scripts/vite-plugin-csp.ts` 的 connect-src 加了 `new URL(MQTT_BROKER_URL).origin`，从 `src/sync/constants.ts` 导入；`tsconfig.node.json` 的 include 加了 `src/sync/constants.ts`。
  - **Bug 修复**：PairingView 的配对码输入框没有传 `isInvalid`，错误提示从来不显示。已修复。
  - **单测**：
    - `qr.test.ts`：用 jsQR 解码验证生成的二维码可扫。
    - `format.test.ts`。
    - `SyncSheet.test.tsx`：15 个，全部通过，无 act 警告。
    - ArchivePage 和 SettingsPage 的入口测试，全部通过。
  - **端到端**：
    - `tests/e2e/syncRelay.ts`：两个独立的浏览器上下文模拟两台设备。init script 只替换以同步前缀开头的 BroadcastChannel，经 exposeBinding 把消息转发到另一台设备；同时设置 `__gvtSyncTest = {signaling: 'broadcast', iceServers: []}`；点对点直连用真实 WebRTC。
    - `tests/e2e/sync.spec.ts` 有两个用例。
    - 用例"推送整个归档库：预览后接收，关闭面板后仍可撤销"：已在 desktop-chromium 下通过。
    - 用例"按课时推送；接收方拒绝后词库不变"：复选框定位写错了（filter 的 has 里用了从面板开始的定位器）。已改成 `devices.second.getByRole('checkbox', ...)`，**还没重跑**。

## 8. 6.7 剩余步骤

1. 重跑 `tests/e2e/sync.spec.ts`，确认 desktop-chromium 和 mobile-chromium 都通过。
2. 运行 prettier、eslint、stylelint 和 tsc（包括 tsconfig.node）。
3. 构建，检查主包体积（上次是 752KB，gzip 后 237KB）。SyncProvider 只应拉入 readPairingLink；如果 sync 模块被打进了主包，需要调整。
4. 更新 README 和 FEATURES.md：G 组 F-070 到 F-081 改成 ✅，并加一段"6.7 实现说明"。
5. 跑 `npm run check`，再跑端到端全量测试。
6. 按清单把所有新增和修改的文件写回用户电脑（流程见第 6 节）。
   - 新增目录：src/sync、src/sync/mqtt、src/features/sync。
   - 新增的测试和端到端文件也要写。
   - 还要包含 tsconfig.node.json、CSP 插件、App.tsx、ArchivePage、DataSection、src/test/library.tsx、src/test/sync.ts、src/test/mqtt.ts、i18n 文案和 design tokens。
7. 发 6.7 汇报（四项格式），并说明两个文件需要用户手动删除：`src/features/archive/selection.ts` 和 `src/features/settings/clipboard.ts`。
8. 进入 6.8（内容见第 2 节）。
