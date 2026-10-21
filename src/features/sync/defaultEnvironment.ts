/**
 * 默认的同步环境：公共 MQTT 信令 + WebRTC 直连（与原版相同的服务器）。
 *
 * 开发模式下，端到端测试可以在页面加载前设置 window.__gvtSyncTest，改用同一浏览器
 * 标签页之间的 BroadcastChannel 信令，并且不使用 STUN（同一台机器上的两个页面直接连通），
 * 测试因此不依赖外部网络。生产构建中这段代码被整体移除。
 */
import {
  DEFAULT_ICE_SERVERS,
  broadcastSignaling,
  describeDevice,
  isWebRtcSupported,
  mqttSignaling,
  webRtcPeers,
} from '../../sync';
import type { SyncEnvironment } from './environment';

export interface SyncTestOverride {
  readonly signaling?: 'broadcast';
  readonly iceServers?: readonly RTCIceServer[];
}

declare global {
  interface Window {
    /** 仅开发模式：端到端测试使用的同步环境 */
    __gvtSyncTest?: SyncTestOverride;
  }
}

export function defaultSyncEnvironment(): SyncEnvironment {
  const override = import.meta.env.DEV ? window.__gvtSyncTest : undefined;
  const iceServers = override?.iceServers ?? DEFAULT_ICE_SERVERS;
  return {
    signaling: override?.signaling === 'broadcast' ? broadcastSignaling() : mqttSignaling(),
    peers: isWebRtcSupported() ? webRtcPeers(iceServers) : null,
    device: describeDevice(navigator),
  };
}
