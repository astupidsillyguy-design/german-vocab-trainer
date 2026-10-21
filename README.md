# 德语词汇背记 · Liquid Glass 重写版

检测并记录学过的德语单词：从外部粘贴词表 → 识别解析 → 测验（固定错词集多轮重测）→ 归档；手机与电脑之间可直连同步。
本项目是对原版单文件 `德语词汇背记 - 副本.html` 的完整重写，原版文件保持不动。

## 当前进度

| 阶段 | 内容                                                       | 状态      |
| ---- | ---------------------------------------------------------- | --------- |
| 1    | 功能盘点（96 项，见 [docs/FEATURES.md](docs/FEATURES.md)） | ✅ 完成   |
| 2    | 架构设计                                                   | ✅ 完成   |
| 3    | 设计系统：Design Tokens + 组件库 + 应用外壳 + 设计系统页   | ✅ 完成   |
| 4    | 液态玻璃（WebGL2 折射 / 色散 / 菲涅尔 + CSS/SVG 降级）     | ✅ 完成   |
| 5    | 动画与交互（可打断弹簧、手势、View Transitions）           | ✅ 完成   |
| 6    | 逐模块实现业务功能（按 F 编号）                            | 🟡 验收中 |

阶段 6 按子步骤推进：

| 子步骤 | 内容                                                    | 状态                |
| ------ | ------------------------------------------------------- | ------------------- |
| 6.1    | 数据底座：IndexedDB、校验与隔离、快照历史、写入失败处理 | ✅ 完成             |
| 6.2    | 词表页与解析器                                          | ✅ 完成             |
| 6.3    | 判分与测验页                                            | ✅ 完成             |
| 6.4    | 结果与轮次                                              | ✅ 完成             |
| 6.5    | 归档库                                                  | ✅ 完成             |
| 6.6    | 设置与发音、旧数据迁移                                  | ✅ 完成             |
| 6.7    | 设备直连同步                                            | ✅ 完成             |
| 6.8    | 收尾：PWA、CSP、性能与跨浏览器验收                      | 🟡 实现完成，验收中 |

词表页、测验页与结果页已可用：粘贴词表、逐行预览、保存并测试（可撤销），然后逐题作答（字母级纠错、刷新后继续、重开可撤销）；每轮结束后查看正确率与错题集，重测首轮错词直到一次全对，通关后一键归档（可撤销）。归档页可以搜索、逐级展开章节与课时、测本章 / 测本课或勾选课时组合测试，用拖动或方向键调整章节与课时顺序；“管理”单击进入编辑模式（双击词条修改、铅笔按钮改名，待测库同名章节 / 课时一起改名），双击进入删除模式（删除课时或章节前自动保存快照），每项修改都可撤销。设置页已提供“数据”与“快照历史”。两台设备可以直连同步归档库：双方选择“发送 / 接收”，输入配对码或扫码连接，发送整库或勾选课时，接收方预览后才写入（可撤销）。组件全集、“液态玻璃实验室”与“动效实验室”可在设计系统页查看。

## 运行

需要 Node.js 20.19 及以上（推荐 24）；Lighthouse 13.5.0 单独要求 Node.js 22.19 及以上与已安装的 Chrome。

```bash
npm install
npm run dev
```

- 应用：<http://localhost:5173/>
- 设计系统页（仅开发模式）：<http://localhost:5173/#/__design>

生产构建与预览：

```bash
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 功能 / CSP 检查
npm run serve      # 含压缩与缓存头的生产行为预览，默认端口 4174
```

构建产物是纯静态文件，可直接部署到任何 HTTPS 静态托管（Cloudflare Pages、GitHub Pages 等）；使用 hash 路由，不需要服务端重写规则。`base: './'` 使资源、Manifest 与 Service Worker 都可以部署到子目录（地址保留末尾 `/`），缓存作用域也限制在该目录。
如需在生产构建中保留设计系统页，构建前设置环境变量 `VITE_DESIGN_GALLERY=true`。

## 脚本

| 命令                   | 作用                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`          | 开发服务器（自动生成 CSS Module 类型）                                                       |
| `npm run build`        | 类型检查后构建                                                                               |
| `npm run check:bundle` | 检查生产产物的 gzip 体积预算                                                                 |
| `npm run serve`        | 含 br / gzip、安全头与缓存头的静态服务器（`npm run serve -- 端口`）                          |
| `npm run lighthouse`   | 对生产产物分别测移动端与桌面端，四类评分均要求 ≥95，低于目标退出失败                         |
| `npm run preview`      | 预览构建产物                                                                                 |
| `npm run typecheck`    | 校验 CSS Module 类型是否最新 + `tsc`（应用与 Node 两套配置）                                 |
| `npm run css-types`    | 重新生成所有 `*.module.d.css.ts`                                                             |
| `npm run lint`         | ESLint（类型感知、无障碍、XSS 规则、分层约束）+ Stylelint（只许用 token）+ Prettier 格式检查 |
| `npm run format`       | Prettier 格式化                                                                              |
| `npm test`             | Vitest 单元 / 组件测试（jsdom + axe）                                                        |
| `npm run test:e2e`     | Playwright 端到端测试                                                                        |
| `npm run check`        | typecheck + lint + test，一次跑完                                                            |

### 端到端测试

首次运行前安装浏览器：

```bash
npx playwright install
npm run test:e2e
```

项目包含 5 个配置：`desktop-chromium`、`mobile-chromium`（Pixel 7）、`desktop-webkit`、`mobile-webkit`（iPhone 15）、`desktop-firefox`。
只想跑其中一部分时加 `--project=desktop-chromium`。如果只有系统自带的 Chromium，可设置 `PLAYWRIGHT_CHROMIUM_PATH` 指向它。

Playwright 会同时启动两个服务器：开发服务器（5173，功能测试）与生产构建预览（4173，`vite build && vite preview`）。本地无网络 / CPU 降速的性能预算（LCP < 2 秒、交互 < 100 ms）只在生产构建上测量——开发模式逐个加载上百个未打包模块，不代表真实体验。

测试会自动检查：页面无控制台错误、WCAG 2.2 AA（axe）、键盘操作与焦点回归、读屏播报区域、减少动态效果 / 增强对比度 / 减少透明度、IndexedDB 坏数据隔离、导出与清除、快照恢复与撤销、空间不足时的提示与重试；拖动、甩动、按压、页面过渡等手势与动效；Liquid Glass 的档位降级、画布像素（内部不透明、外围透明、边缘高光、形状融合）、失焦 / 隐藏 / 滚出视口时停止绘制、上下文丢失与恢复。生产构建还覆盖全部业务路由的 axe 扫描、CSP 拦截、语言包提前请求、安装资源、离线启动与切换语言，以及两个真实 Service Worker 版本之间的等待确认 / 刷新 / 旧缓存清理。

## PWA、部署与安全

- **安装与离线。** 生产构建生成 Manifest、标准 / maskable 图标与 iOS 主屏幕图标。通过 HTTPS 部署后可安装到主屏幕；本地 `localhost` 也可以验证。全部业务页面、四种语言、默认拉丁字体与安装资源都会预缓存，缓存成功后可离线启动、做题、归档与切换语言。语音是否离线可用取决于系统是否安装本地德语语音；设备直连仍需要网络。
- **注册时机。** Service Worker 在页面 `load` 后等待至少 3 秒，再在空闲时注册。首次访问在缓存完成前就断网，不保证离线可用；已有缓存的后续访问不受注册延迟影响。
- **更新。** 新版本的文件全部下载成功后才提示“有新版本可用”，用户点“刷新”后才接管；安装不完整则继续保留旧版本。接管时清理旧版本缓存，词库、快照与测验进度所在的 IndexedDB 不会被清理。同一作用域的其他已打开标签页也会跟随刷新，更新前请结束正在进行的编辑 / 传输。回到前台时最多每小时主动检查一次更新。
- **安全。** `script-src 'self'` 禁止内联脚本、`eval` 与外站脚本；语言预加载使用极小的同源外部脚本，不增加 CSP 例外。生产 HTML 自带 meta CSP，`dist/_headers` 额外提供 `frame-ancestors 'none'`、`nosniff`、`Referrer-Policy` 与权限限制。摄像头只允许本站，麦克风 / 地理位置等未使用能力关闭。
- **取舍。** 暂不启用 Trusted Types：React Aria 的读屏播报器内部仍使用清空 HTML 的操作，强制启用会破坏现有组件。应用侧依然由 ESLint 禁止 `innerHTML`、`dangerouslySetInnerHTML` 与动态执行，并校验外部数据。不启用 COOP / COEP，因为没有使用需要跨源隔离的共享内存等能力，避免不必要地改变浏览上下文。

Cloudflare Pages / Netlify 会读取 `_headers`；GitHub Pages 等不识别该文件的托管仍有 meta CSP，但不能由 meta 提供点击劫持防护和其他响应头。nginx / Apache / Caddy 必须按 `dist/_headers` 的名称与完整值配置，不要仅上传文件就当作响应头已经生效。

nginx 配置要点（CSP 的完整值从当次构建 `dist/_headers` 的 `/*` 段复制）：

```nginx
# server 层设置所有安全响应头，例如：
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
# add_header Content-Security-Policy "当次构建的完整 CSP 值" always;
# add_header Permissions-Policy "当次构建的完整权限策略值" always;
gzip on;
gzip_types text/css text/javascript application/javascript application/json application/manifest+json image/svg+xml;
location /assets/ { expires 1y; }
location = /index.html { expires -1; }
location = /sw.js { expires -1; }
location = /manifest.webmanifest { expires -1; }
```

子目录部署时把这些 `location` 路径加上目录前缀；入口 `/` 同样设为不缓存。不要在子 `location` 中另设少数 `add_header` 而遗漏安全头（nginx 会停止继承上层 `add_header`）。Service Worker、入口 HTML 与 Manifest 每次校验，带内容哈希的 `/assets/` 长期缓存。

## 性能与验收

```bash
npm run build
npm run check:bundle
npm run lighthouse
```

Lighthouse 首次由 `npx` 下载固定版本 13.5.0，不增加运行时依赖；需要联网，且 Node.js ≥22.19。找不到 Chrome 时设置 `CHROME_PATH`。容器可额外设置 `LIGHTHOUSE_CHROME_FLAGS="--no-sandbox --disable-dev-shm-usage"`，本机正常运行不需要关闭沙箱。`vite preview` 没有压缩，不用它评价 Lighthouse；性能脚本会自行启动带压缩与生产响应头的服务器。

- **体积预算。** 首屏脚本（包括最大一种语言文案）≤210 KB gzip，首屏样式 ≤20 KB，单个按需块 ≤60 KB；超出时 `check:bundle` 失败。当前约为脚本 189.8 KB、样式 14.4 KB、最大按需块 45.3 KB。
- **拆包。** 默认测验页随首屏加载，归档 / 词表 / 设置页、设备同步、扫码与 WebGL 引擎按需加载。其余业务页面与语言在首屏稳定后空闲预加载，语言切换先下载再一次性切换，下载失败保持原语言。语言文案与默认拉丁字体提前请求，减少首屏瀑布。
- **维护约束。** `package.json` 的 `sideEffects: ["**/*.css"]` 允许删除未使用的 JS 模块；今后若新增只靠副作用导入的 JS 模块，必须加入这份清单，或改成显式调用。Rolldown 的 `shared` 分组把被多个入口共用的依赖合并，避免首屏变成十几个小请求，特别是 HTTP/1.1 部署。
- **评分标准。** 移动端与桌面端的 performance / accessibility / best-practices / SEO 均以 95 为目标；不因环境或当前结果下调验收门槛。Lighthouse 的慢速 4G + 4 倍 CPU 模拟，与本地无降速的 Playwright 性能预算是两项独立检查。

### 本轮沙盒验收结果

- `npm run check` 通过：应用 / Node 类型检查、ESLint、Stylelint、Prettier，以及 **92 个测试文件、1095 项单元 / 组件测试**全部通过。
- `npm run build` 与 `npm run check:bundle` 通过，体积结果见上文。
- Playwright 三个项目完整重跑：**290 项通过、0 项失败、10 项按浏览器能力跳过**。Chromium 桌面与手机各 100 项通过，Firefox 90 项通过；Firefox 的跳过项涉及 Chromium 专属的 WebGL 像素 / 调试、媒体偏好模拟和当前不支持的页面过渡。已验证根目录与子目录部署的真实双版本 PWA 更新流程，以及 Firefox 的设备同步流程。
- 修复了首屏并行加载引出的启动通知竞态：坏数据隔离 / 存储不可用的事件会保留到首个通知订阅者出现，再消费一次，不因语言包或组件挂载时序漏报；新增 3 项回归测试，完整浏览器回归亦已通过。
- 最终构建的 Lighthouse 13.5.0 本轮结果：**桌面端四类均为 100；移动端 performance 93，其余三类均为 100**。此前移动端三次冷启动为 94 / 94 / 95，仍未稳定达到 95。因此 `npm run lighthouse` 正确返回失败，6.8 保持“验收中”，不将它标为全部达标。
- **尚未验证：**本沙盒未运行 WebKit（桌面 / 手机）项目；真实 iPhone / Safari、跨设备公共 MQTT / WebRTC 网络与真机相机扫码仍需设备实测。自动化同步使用本地可控信令，不能替代公网与真机验收。

以上是沙盒中对本次代码的实测，不代表已经在用户电脑上执行过命令。同步完成后，先按文末清单删除 5 个遗留文件，再运行 `npm install`、`npm run check`、`npm run build`、`npm run check:bundle`；通过后可用 `npm run serve` 做本地体验。正式发布前仍需补齐 WebKit / 真机验证，并解决移动端性能门槛未达标的问题。

## 依赖维护

运行时不使用 CDN。`npm audit` 当前报告的 7 项 high 均属于仅开发时使用的 Stylelint → globby / fast-glob → micromatch → braces 链路（嵌套模式导致栈耗尽），生产前端包不包含这条链路；这不等于工具链没有风险，不要对不可信仓库 / 模式运行检查。等待上游可兼容修复，**不要执行 `npm audit fix --force`**：当前建议会降级至不兼容的旧版 Stylelint。ESLint 暂留 9：`eslint-plugin-jsx-a11y@6.10.2` 的 peer 范围尚不支持 10，不为“最新版本”破坏无障碍检查。

## Liquid Glass

同一组 Token（`src/design/tokens/glass.ts`）驱动四个渲染档位，按设备能力与系统设置自动选择，文字对比度在所有档位下一致：

| 档位         | 条件                                                                     | 效果                                                                         |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `webgl`      | WebGL2 + 硬件 GPU，用户选择“自动”                                        | 边缘折射、色散、菲涅尔、方向高光、指针高光、形状投影；同组玻璃像液体一样融合 |
| `refraction` | Chromium（Chrome / Edge）                                                | `backdrop-filter` 模糊 + SVG 位移贴图近似边缘折射                            |
| `blur`       | Safari、Firefox，或用户选择“仅模糊”                                      | `backdrop-filter` 模糊                                                       |
| `opaque`     | 减少透明度 / 增强对比度 / 强制颜色 / 不支持 `backdrop-filter` / 用户选择 | 不透明材质                                                                   |

- 首屏总是先用 CSS 档；WebGL 引擎（约 9 KB gzip）在浏览器空闲时才下载并编译着色器，成功后无缝升级，不影响 LCP。
- WebGL 档只折射动态壁纸（浏览器不允许读取页面像素），所以 Tab Bar、侧边栏、Sheet 等背后会滚过页面内容的元素固定使用 CSS 档（`renderer="css"`）。
- 按需渲染：只有变化时才绘制；壁纸流动限制在 30 fps，窗口失焦、页面隐藏、20 秒无操作或“减少动态效果”时冻结；只绘制视口内的玻璃组。
- 自我保护：软件渲染器（SwiftShader、llvmpipe 等）不启用 WebGL；运行中主线程渲染开销持续超出预算（最近 30 帧中 5 帧 > 32 ms）时自动退回 CSS 档；上下文丢失时立即降级，恢复后重新升级。
- 用法：`<LiquidGlass variant="clear" radius="xl" interactive>`；需要融合的元素放进同一个 `<GlassGroup spacing={24}>`。
- 开发模式调试：控制台执行 `__gvtGlass.stats()` 查看帧数与开销，`__gvtGlass.loseContext()` / `restoreContext()` 模拟上下文丢失；在没有 GPU 的环境里，页面加载前设置 `window.__gvtGlassForceWebgl = true` 可强制启用 WebGL（端到端测试即如此）。

## 动画与交互

所有动效都可以被打断：动画进行中随时可以抓住、反向，位置与速度保持连续；松手时继承手指的速度。

- **弹簧（`src/motion`）。** 动画由弹簧物理逐帧求解（所有动画共用一个 `requestAnimationFrame`，没有任务时停止），参数与 CSS 弹簧 Token 同源（阻尼比 + 响应时间）。动画只写 `translate` / `scale` 等独立属性或 CSS 变量，不触发 React 渲染。
- **手势（`useDrag`）。** 鼠标、触摸、触控笔统一处理；超过阈值才激活（普通点按、键盘不受影响），可锁定方向把另一方向交给页面滚动；松手速度取最近 100 ms，停顿后松手速度为 0；拖完后迟到的点击会被吞掉，不会误触链接。松手时按速度投射（与 iOS `UIScrollView.DecelerationRate` 相同的公式）选择停靠点。
- **组件。** 按钮按下时弹性缩放（玻璃放大、其余缩小，轻点也至少保持 90 ms）；Tab Bar 与分段控件的选中块可以按住拖成“水滴”滑到另一项；开关滑块可拖动；侧边栏选中块随页面滑动；Sheet 可在半屏 / 全屏间拖动、向下甩出关闭，遮罩随之变淡；通知以弹簧补位，可朝屏幕边缘滑走（手机在顶部、平板与桌面在右下角）；玻璃按钮带跟随指针的高光。
- **页面过渡。** 使用 View Transitions：同级页面交叉淡化，进入下一级 / 返回时内容区推入 / 退后；Tab Bar、侧边栏与通知不参与过渡。不支持的浏览器（目前 Firefox）直接切换。
- **WebGL 联动。** 玻璃组内的形状移动时派发 `gvt:motionframe` 事件，引擎只在这些帧重绘。
- **减少动态效果。** 位移、缩放类动画直接跳到终点，只保留淡入淡出；手势仍然跟手（直接操作不属于动画）。

## 数据存储

所有数据只保存在本机浏览器的 IndexedDB 中（数据库 `german-vocab-trainer`），不上传任何服务器。

| 仓库            | 内容                                                         |
| --------------- | ------------------------------------------------------------ |
| `library`       | 待测库、归档库、归档排序表（三个键分别存放，只写发生变化的） |
| `snapshots`     | 快照摘要（时间、原因、词数），列出历史时不必读取完整数据     |
| `snapshot-data` | 快照的完整词库                                               |
| `quarantine`    | 无法识别的原始数据（原样保留）                               |
| `state`         | 其他应用状态（测验进度 `quiz.session`、旧数据迁移记录）      |

- **校验与隔离。** 读取时每条词条都按 schema 校验（白名单字段、长度与数量上限、UUID、ISO 时间）。坏数据只影响它自己：原始值在同一事务中移入隔离区，其余数据照常加载，并提示“发现 N 条无法识别的数据”；设置页可导出为 JSON 或清除。
- **写入。** 修改先更新界面（乐观更新），再串行写入；写入期间的多次修改合并为一次。写入失败时修改保留在页面中，显示常驻通知（空间不足有专门说明）与“重试”，关闭页面前浏览器会提醒；之后任何一次成功写入都会补上全部未保存的变化。
- **快照。** 整体替换待测库、接收同步、导入数据之前自动保存快照，最多保留最近 20 份；在设置页恢复，恢复前会先保存当前状态，恢复后 6 秒内可撤销。
- **存储不可用**（例如部分无痕模式）时退回内存，并常驻提示“更改只保留到关闭页面为止”。首次成功写入后申请持久化存储，避免浏览器在空间紧张时清除数据。
- **多个标签页**通过 BroadcastChannel 互相通知；没有未保存修改的标签页会自动重新读取。
- **词条 ID** 使用 UUID；另有内容指纹（章节 + 课时 + 题面 + 标准答案）仅用于导入与同步时去重。
- **偏好设置**（界面语言、玻璃效果档位、语速与语音、侧边栏折叠）很小且需要在首帧前读取，保存在 localStorage（`gvt.pref.*`）。

### 从原版迁移

原版把数据保存在 localStorage 的 `DE_QUIZ_` 键中。新版只读取、不修改这些键，原版可以继续使用。

- **新版与原版在同一网址下**：第一次打开时自动迁移（词库为空时直接导入；已有内容时只提示，可在设置中选择合并或替换）。
- **不在同一网址下**（例如原版是本地 HTML 文件）：在“设置 → 数据 → 导入旧版数据… → 如何从原版导出数据？”中下载导出工具，
  放到原版 HTML 所在的电脑上，用平时打开原版的浏览器打开并点“导出数据”，再回到新版选择生成的 JSON 文件。
  Firefox 中每个本地文件的存储相互独立，导出工具读不到时，在原版页面的开发者工具控制台中执行页面上提供的代码。

导入前会预览数量与整理说明（例如名词去掉不带冠词的答案）；导入前自动保存快照，可以撤销；转换不了的词条原样保留在“无法识别的数据”中。

## 设备直连同步

在归档页或“设置 → 数据 → 设备同步…”打开。词库数据只在两台设备之间传输，公共服务器只用来交换连接信息。

1. 两台设备各自选择“发送”或“接收”（必须一发一收），各自显示 6 位配对码和二维码；任意一方输入对方的配对码（支持全角数字与空格）或扫描对方的二维码即可连接。二维码中是带配对码的应用地址，用系统相机扫描也能直接打开应用并连接。
2. 连接成功后两边都会看到对方的设备名（如“iPhone · Safari”）。发送方选择“整个归档库”或按课时勾选（章节复选框支持半选），点“发送”。
3. 接收方先看到预览：覆盖方式、会替换 / 新增 / 删除多少词条，以及涉及的课时（名称一律作为纯文本显示）。确认后才写入，写入有进度；写入前自动保存快照，通知中可撤销，断开连接后仍可在“快照历史”中恢复。
4. 只同步归档库与归档排序，待测库不受影响。

- **连接方式。** 配对阶段通过公共 MQTT 服务器（`wss://broker.emqx.io:8084/mqtt`，与原版相同）交换 WebRTC 连接信息；数据通道打开并互相确认后立即断开信令，数据经 DTLS 加密的点对点直连传输，同一局域网内的设备不经过 STUN 也能连通。信令做成可替换的适配器（`SignalingAdapter`），MQTT 为自己实现的 3.1.1 最小子集（连接、发布、订阅、心跳），没有引入第三方客户端。
- **协议 v3。** 与原版（v2）不兼容，信令主题也不同，两者不会互相连上；扫描原版的二维码会明确提示。载荷序列化为 JSON，按 16 KB 分片，每片带序号；接收方逐片核对序号与长度，收齐后核对校验和，最后经 schema 校验才会使用，任何一步不通过整份数据都丢弃。载荷上限 32 MB；发送缓冲超过 1 MB 时暂停（流控）。来自公共服务器的任何消息都先限制长度、再解析、再按白名单校验。
- **状态与超时。** 连接信令服务器 10 秒、等待对方应答 15 秒、建立直连 20 秒、传输中两片之间最长 15 秒、网络短暂中断后等待恢复 5 秒；对方忙碌、角色相同、协议版本不同、断开与失败都有明确提示与“重试”。传输或写入过程中关闭面板会先确认。
- **按需加载。** 同步面板、传输层与二维码扫描（jsQR，仅在浏览器没有 `BarcodeDetector` 时使用）在第一次打开面板时才加载，不增加首屏体积。首屏只需要“读取地址中的配对码”，该小模块放在 `src/shared/pairing.ts`，不要从 `src/sync` 入口导入它，否则传输层会被打进首屏包。
- **测试。** 传输层用内存信令与内存直连测试；MQTT 客户端用可控的假 WebSocket 测试；端到端测试在开发模式下通过 `window.__gvtSyncTest` 改用同一浏览器内的 BroadcastChannel 信令，不依赖外部网络，生产构建中这段代码被整体移除。

## 目录结构

```text
src/
  main.tsx              入口：字体、Token CSS、全局样式、首帧前确定语言与尺寸等级
  app/                  应用外壳、routePages 按需路由、UpdateNotifier 更新通知（Tab Bar ↔ 侧边栏）
  design/
    tokens/             Design Tokens（颜色、材质、字体、间距、圆角、阴影、动效、断点、层级）
    math/               纯函数：弹簧求解、WCAG 对比度、超椭圆路径、壁纸几何
    build/              把 Token 编译成 CSS 变量（含减少动态效果 / 透明度、增强对比度、强制颜色模式）
  glass/                Liquid Glass 渲染引擎（与框架无关）：档位决策、SDF / 光学剖面 / 模糊计划、WebGL2 引擎（动态加载）
  motion/               动效核心（与框架无关）：帧循环、可打断弹簧、速度估计、手势数学、退场列表、页面过渡
  ui/                   组件库，唯一入口 src/ui/index.ts（Glass/ 为玻璃的 React 绑定，motion/ 为动效的 React 绑定）
  domain/               领域模型（纯函数，不依赖 React 与浏览器存储）：词条、词表解析、判分与测验会话、归档、指纹、排序表、快照、数据 schema、旧版数据转换
  storage/              持久化：IndexedDB 仓库、坏数据隔离、快照、写入队列（LibraryStore）、多标签页通知
  pwa/                  Service Worker 注册、更新确认通道与测试
  sync/                 设备同步传输层（与框架无关）：MQTT 信令、WebRTC 直连、分片传输、会话状态机
  features/             业务页面与功能：library（词库 Provider 与通知）、words（词表页）、quiz（测验进度、测验页与结果页）、archive（归档页）、speech（德语发音）、settings（设置页）、sync（设备同步面板）
  i18n/                 四种界面语言（简中 / 英 / 德 / 日），类型保证各语言键完全一致
  gallery/              设计系统页（只在开发模式打包）
  shared/               无依赖的小工具（运行时校验组合子、文件下载、偏好设置、哈希、配对码、idle 首屏稳定后空闲调度）
  styles/               全局样式：重置与全局规则（global.css）、页面过渡（view-transitions.css）
  test/                 测试辅助：可控 matchMedia、i18n / 词库渲染、axe 检查、指针手势、测试词条与可控仓库、原版数据夹具
scripts/                Vite 插件（Token、CSS Module 类型、CSP、PWA、语言 / 字体预加载）、压缩静态服务器、体积预算与 Lighthouse
  pwa/                  构建时生成图标 / Manifest / 预缓存版本与清单，Service Worker 源码
tests/e2e/              Playwright 测试
docs/FEATURES.md        功能清单与完成状态
```

分层约束由 ESLint 强制：`design`（纯数据）→ `glass` / `motion`（不依赖 React）→ `ui` → `features` → `app` / `gallery`，下层不得依赖上层；`domain`（纯逻辑）→ `storage`（只依赖 domain 与 shared）→ `features`；`sync`（只依赖 domain 与 shared）→ `features/sync`；`ui` 只能从 `src/glass`、`src/motion` 入口导入（WebGL 引擎必须动态加载）；业务代码只从 `src/ui` 入口导入组件。

## 开发约定

- **Token 是唯一的数值来源。** TS 中定义（`src/design/tokens`），构建时生成 CSS 变量（虚拟模块 `virtual:design-tokens.css`）。Stylelint 禁止在组件 CSS 里写颜色值、间距、圆角、字号、时长等字面量；ESLint 禁止魔法数字。
- **CSS Module 类型。** 每个 `*.module.css` 旁边会生成 `*.module.d.css.ts`，类名拼错会在编译期报错。开发服务器会自动更新；手动执行 `npm run css-types`；`npm run typecheck` 会检查是否过期。这些文件需要提交。
- **动画只改 transform / opacity。** 时长与曲线来自弹簧 Token（由阻尼比与响应时间求解）：CSS 过渡用生成的 `linear()` 曲线，需要打断或跟手的动画用 `src/motion` 的 JS 弹簧（同一组参数）。“减少动态效果”时弹簧时长归零，只保留淡入淡出。
- **安全。** 禁止 `dangerouslySetInnerHTML` / `innerHTML` 等写法（ESLint 规则）；生产构建注入 CSP；所有持久化与外部数据（本地存储、导入、同步）都经过 schema 校验（`src/shared/schema.ts` + `src/domain/schemas.ts`）；前端不存放任何密钥。
- **无障碍。** 交互组件基于 React Aria（键盘、焦点、读屏语义）；每个组件测试都包含 axe 检查。

## 浏览器支持

最新两个版本的 Safari（iOS / macOS）、Chrome、Edge、Firefox。
连续曲率圆角优先使用 CSS `corner-shape: squircle`，不支持时用按尺寸生成的 `clip-path` 降级；玻璃的渲染档位见上文 [Liquid Glass](#liquid-glass)。

## 用户电脑上的旧文件清理

当前本地工作区连接不能删除文件；以下文件在重写中已移除，但如果你的电脑上仍存在，需手动删除（路径相对于项目根目录）。**请在运行类型检查前清理**，否则旧占位代码可能引用已删除的接口而报错。

- `src/app/PlaceholderPage.tsx`
- `src/app/PlaceholderPage.module.css`
- `src/app/PlaceholderPage.module.d.css.ts`
- `src/features/archive/selection.ts`（6.7 遗留，不是 `src/domain/selection.ts`）
- `src/features/settings/clipboard.ts`（6.7 遗留）

只清理以上列出的旧文件；不要删除原版 HTML、浏览器数据或快照。
