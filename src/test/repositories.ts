/**
 * 测试用仓库：可以让写入失败或暂停，可以预置“无法识别的数据”，也可以伪装成 IndexedDB。
 */
import type { Library } from '../domain';
import {
  MemoryRepository,
  type LoadResult,
  type QuarantineRecord,
  type SaveRequest,
  type StorageError,
  type StorageKind,
} from '../storage';

export interface ControlledRepositoryOptions {
  readonly initial?: Library;
  readonly kind?: StorageKind;
  readonly quarantine?: readonly QuarantineRecord[];
}

export class ControlledRepository extends MemoryRepository {
  override readonly kind: StorageKind;
  readonly saves: SaveRequest[] = [];
  /** 每次 writeState 的 [键, 值] */
  readonly stateWrites: [string, unknown][] = [];
  failure: StorageError | null = null;
  readonly #presetQuarantine: number;
  #reportedQuarantine = false;
  #gate: Promise<void> | null = null;
  #release: (() => void) | null = null;

  constructor({ initial, kind = 'memory', quarantine = [] }: ControlledRepositoryOptions = {}) {
    super(initial, quarantine);
    this.kind = kind;
    this.#presetQuarantine = quarantine.length;
  }

  /** 暂停之后的写入，直到 release() */
  hold(): void {
    this.#gate = new Promise((resolve) => {
      this.#release = resolve;
    });
  }

  release(): void {
    this.#release?.();
    this.#gate = null;
  }

  override async load(): Promise<LoadResult> {
    const result = await super.load();
    // 与 IndexedDB 一致：预置的隔离记录只在第一次加载时报告为“新发现”
    const quarantined = this.#reportedQuarantine ? 0 : this.#presetQuarantine;
    this.#reportedQuarantine = true;
    return { ...result, quarantined };
  }

  override async save(request: SaveRequest): Promise<void> {
    this.saves.push(request);
    if (this.#gate !== null) await this.#gate;
    if (this.failure !== null) throw this.failure;
    await super.save(request);
  }

  override async writeState(key: string, value: unknown): Promise<void> {
    this.stateWrites.push([key, value]);
    if (this.#gate !== null) await this.#gate;
    if (this.failure !== null) throw this.failure;
    await super.writeState(key, value);
  }
}
