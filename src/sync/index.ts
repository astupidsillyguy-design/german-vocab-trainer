/**
 * 设备直连同步的传输层（F-070 – F-081）：配对码、信令（可替换的适配器）、WebRTC 直连、
 * 分片传输与会话控制。与界面框架无关，只依赖领域层与共享工具。
 */
export {
  DEFAULT_ICE_SERVERS,
  MQTT_BROKER_URL,
  SIGNALING_NAMESPACE,
  SYNC_PROTOCOL,
  SYNC_TIMEOUTS,
  TRANSFER_LIMITS,
  type SyncTimeouts,
} from './constants';
export { describeDevice, type DeviceHints } from './device';
export { SYNC_ROLES, TRANSFER_RESULTS, type SyncRole, type TransferResult } from './messages';
export { MqttClient, MqttError, type MqttSocket, type MqttSocketFactory } from './mqtt/MqttClient';
export type {
  IceCandidateData,
  PeerCloseReason,
  PeerFactory,
  PeerLink,
  PeerLinkEvents,
} from './peer';
export {
  broadcastSignaling,
  mqttSignaling,
  type MqttSignalingOptions,
  type SignalingAdapter,
  type SignalingConnection,
  type SignalingEvents,
} from './signaling';
export {
  SyncSession,
  type ApplyPayload,
  type SyncEndReason,
  type SyncOutcome,
  type SyncOutcomeResult,
  type SyncPhase,
  type SyncProblem,
  type SyncSessionOptions,
  type SyncState,
  type TransferProgress,
} from './SyncSession';
export { isWebRtcSupported, webRtcPeers } from './webrtc';
