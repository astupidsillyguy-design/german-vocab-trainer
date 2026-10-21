/**
 * 离线与安装：Service Worker 注册、版本更新通知。
 */
export {
  registerServiceWorker,
  SKIP_WAITING_MESSAGE,
  UPDATE_CHECK_INTERVAL_MS,
  type RegisterOptions,
  type RegistrationLike,
  type WorkerContainerLike,
  type WorkerLike,
} from './registerServiceWorker';
export { UpdateChannel, updateChannel } from './updateChannel';
