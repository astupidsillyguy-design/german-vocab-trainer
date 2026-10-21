/**
 * 解析器的按行缓存。编辑时通常只有一行变化，其余行直接命中缓存。
 * 每次解析结束时淘汰本次没有用到的结果（只在缓存明显大于当前行数时才清理，摊销成本很低），
 * 内存不会随编辑历史无限增长。
 */
/** 缓存条目数超过“当前行数 × 此倍数 + 余量”时清理 */
const PRUNE_FACTOR = 2;
const PRUNE_SLACK = 256;

interface Slot<V> {
  readonly value: V;
  used: number;
}

export class LineCache<K, V> {
  readonly #slots = new Map<K, Slot<V>>();
  #pass = 0;

  get(key: K, compute: () => V): V {
    const slot = this.#slots.get(key);
    if (slot !== undefined) {
      slot.used = this.#pass;
      return slot.value;
    }
    const value = compute();
    this.#slots.set(key, { value, used: this.#pass });
    return value;
  }

  /** 每次完整解析之后调用；liveCount 为本次用到的条目数 */
  endPass(liveCount: number): void {
    if (this.#slots.size > liveCount * PRUNE_FACTOR + PRUNE_SLACK) {
      for (const [key, slot] of this.#slots) {
        if (slot.used !== this.#pass) this.#slots.delete(key);
      }
    }
    this.#pass += 1;
  }

  get size(): number {
    return this.#slots.size;
  }
}
