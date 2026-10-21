/**
 * 信令（F-074）：配对阶段交换连接信息（SDP、ICE 候选）的通道。做成可替换的适配器：
 * - mqttSignaling：公共 MQTT 服务器（默认，与原版相同）；
 * - broadcastSignaling：同一浏览器的不同标签页之间（端到端测试与本机调试）。
 * 适配器只负责按“房间”（配对码）收发文本；消息格式与校验见 messages.ts。
 */
import { newId } from '../domain';
import {
  BROADCAST_CHANNEL_PREFIX,
  MQTT_BROKER_URL,
  MQTT_KEEP_ALIVE_SECONDS,
  MQTT_MAX_PACKET_BYTES,
  SIGNAL_LIMITS,
  SIGNALING_NAMESPACE,
  SYNC_TIMEOUTS,
} from './constants';
import { MqttClient, type MqttSocketFactory } from './mqtt/MqttClient';

export interface SignalingEvents {
  readonly onMessage: (room: string, text: string) => void;
  /** 连接意外断开（主动 close() 不触发） */
  readonly onDrop: () => void;
}

export interface SignalingConnection {
  /** 开始接收某个房间的消息 */
  join(room: string): Promise<void>;
  leave(room: string): void;
  send(room: string, text: string): void;
  close(): void;
}

export interface SignalingAdapter {
  connect(events: SignalingEvents): Promise<SignalingConnection>;
}

export interface MqttSignalingOptions {
  readonly url?: string;
  readonly namespace?: string;
  readonly timeoutMs?: number;
  readonly createSocket?: MqttSocketFactory;
}

/** MQTT 3.1.1 建议客户端标识不超过 23 个字符 */
const CLIENT_ID_LENGTH = 20;
const CLIENT_ID_PREFIX = 'gvt_';

function newClientId(): string {
  return (CLIENT_ID_PREFIX + newId().replaceAll('-', '')).slice(0, CLIENT_ID_LENGTH);
}

export function mqttSignaling({
  url = MQTT_BROKER_URL,
  namespace = SIGNALING_NAMESPACE,
  timeoutMs = SYNC_TIMEOUTS.signalingMs,
  createSocket,
}: MqttSignalingOptions = {}): SignalingAdapter {
  const prefix = `${namespace}/`;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return {
    async connect(events) {
      const client = await MqttClient.connect(
        {
          url,
          clientId: newClientId(),
          timeoutMs,
          keepAliveSeconds: MQTT_KEEP_ALIVE_SECONDS,
          maxPacketBytes: MQTT_MAX_PACKET_BYTES,
          ...(createSocket === undefined ? {} : { createSocket }),
        },
        {
          onMessage: (topic, payload) => {
            if (!topic.startsWith(prefix) || payload.length > SIGNAL_LIMITS.messageChars) return;
            let text: string;
            try {
              text = decoder.decode(payload);
            } catch {
              return;
            }
            events.onMessage(topic.slice(prefix.length), text);
          },
          onClose: events.onDrop,
        },
      );
      return {
        join: (room) => client.subscribe(prefix + room),
        leave: (room) => {
          client.unsubscribe(prefix + room);
        },
        send: (room, text) => {
          client.publish(prefix + room, encoder.encode(text));
        },
        close: () => {
          client.close();
        },
      };
    },
  };
}

/** 同一浏览器的标签页之间（BroadcastChannel 不会把消息发回给发送者自己） */
export function broadcastSignaling(prefix: string = BROADCAST_CHANNEL_PREFIX): SignalingAdapter {
  return {
    connect(events) {
      const channels = new Map<string, BroadcastChannel>();
      const nameOf = (room: string): string => `${prefix}:${room}`;
      const connection: SignalingConnection = {
        join(room) {
          if (!channels.has(room)) {
            const channel = new BroadcastChannel(nameOf(room));
            channel.onmessage = (event: MessageEvent<unknown>) => {
              if (typeof event.data === 'string') events.onMessage(room, event.data);
            };
            channels.set(room, channel);
          }
          return Promise.resolve();
        },
        leave(room) {
          channels.get(room)?.close();
          channels.delete(room);
        },
        send(room, text) {
          const joined = channels.get(room);
          if (joined !== undefined) {
            joined.postMessage(text);
            return;
          }
          const channel = new BroadcastChannel(nameOf(room));
          channel.postMessage(text);
          channel.close();
        },
        close() {
          for (const channel of channels.values()) channel.close();
          channels.clear();
        },
      };
      return Promise.resolve(connection);
    },
  };
}
