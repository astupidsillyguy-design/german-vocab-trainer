import '@fontsource-variable/inter/wght.css';
import 'virtual:design-tokens.css';
import './styles/global.css';
import './styles/view-transitions.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startSpeechServices } from './features/speech';
import { loadMessages, resolveInitialLocale } from './i18n';
import { registerServiceWorker, updateChannel } from './pwa';
import { runWhenSettled } from './shared/idle';
import { createLibraryStore } from './storage';
import { syncSizeClassAttribute } from './ui';

const container = document.getElementById('root');
if (container === null) throw new Error('缺少挂载节点 #root');

const initialLocale = resolveInitialLocale();
// 首帧渲染前确定语言与尺寸等级，避免字体回退与布局跳动
document.documentElement.lang = initialLocale;
syncSizeClassAttribute();

const libraryStore = createLibraryStore();
// 读取本地数据与下载语言文案同时进行，首屏渲染时数据多半已经就绪
void libraryStore.load();
// 提前加载德语语音，并在第一次用户手势中预热语音合成（F-086）
startSpeechServices();

// 只下载当前语言的文案，渲染时才不需要等待
const initialMessages = await loadMessages(initialLocale);

createRoot(container).render(
  <StrictMode>
    <App
      initialLocale={initialLocale}
      initialMessages={initialMessages}
      libraryStore={libraryStore}
    />
  </StrictMode>,
);

// 离线缓存只在生产构建中启用，并且等首屏稳定之后再注册
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  runWhenSettled(() => {
    registerServiceWorker({
      container: navigator.serviceWorker,
      scriptUrl: `${import.meta.env.BASE_URL}sw.js`,
      onUpdateReady: (apply) => {
        updateChannel.offer(apply);
      },
      reload: () => {
        window.location.reload();
      },
    }).catch((error: unknown) => {
      console.warn('Service Worker 注册失败，离线缓存不可用。', error);
    });
  });
}
