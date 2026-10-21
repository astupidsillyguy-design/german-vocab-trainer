/**
 * 同步会话依赖的外部环境：信令、直连与本机描述。默认环境（公共 MQTT + WebRTC）在面板的
 * 按需加载模块中创建，测试时注入内存实现。
 */
import type { PeerFactory, SignalingAdapter, SyncTimeouts } from '../../sync';

export interface SyncEnvironment {
  readonly signaling: SignalingAdapter;
  /** 浏览器不支持 WebRTC 时为 null */
  readonly peers: PeerFactory | null;
  /** 本机设备描述（如 “iPhone · Safari”），连接后显示给对方 */
  readonly device: string | null;
  readonly timeouts?: Partial<SyncTimeouts>;
  readonly chunkBytes?: number;
}

export type SyncEnvironmentFactory = () => SyncEnvironment;
