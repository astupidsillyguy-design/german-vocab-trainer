/**
 * 玻璃组与形状的登记簿（不涉及 WebGL，便于单元测试）。
 */
import type { ShapeKind } from '../math/sdf';
import type { ResolvedOptics, Vec4 } from '../optics';
import type { GroupOptions, ShapeOptions } from './types';

export interface ShapeRecord {
  readonly id: number;
  readonly element: HTMLElement;
  kind: ShapeKind;
  radius: number;
  tint: Vec4;
}

export interface PointerState {
  /** 视口坐标 */
  x: number;
  y: number;
  /** 目标强度：1 = 指针在组内 */
  target: number;
  /** 当前（缓动中的）强度 */
  value: number;
}

export interface GroupRecord {
  readonly id: number;
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly shapes: Map<number, ShapeRecord>;
  readonly pointer: PointerState;
  optics: ResolvedOptics;
  spacing: number;
  context: CanvasRenderingContext2D | null;
  visible: boolean;
  dirty: boolean;
  rendered: boolean;
  /** 进行中的 CSS 过渡/动画数量（形状可能在动，需要逐帧重绘） */
  transitions: number;
  transitionsSince: number;
}

export class GlassRegistry {
  readonly groups = new Map<number, GroupRecord>();
  #nextId = 1;

  #id(): number {
    const id = this.#nextId;
    this.#nextId += 1;
    return id;
  }

  addGroup(options: GroupOptions, visible: boolean): GroupRecord {
    const record: GroupRecord = {
      id: this.#id(),
      root: options.root,
      canvas: options.canvas,
      shapes: new Map(),
      pointer: { x: 0, y: 0, target: 0, value: 0 },
      optics: options.optics,
      spacing: options.spacing,
      context: null,
      visible,
      dirty: true,
      rendered: false,
      transitions: 0,
      transitionsSince: 0,
    };
    this.groups.set(record.id, record);
    return record;
  }

  removeGroup(id: number): GroupRecord | undefined {
    const record = this.groups.get(id);
    this.groups.delete(id);
    return record;
  }

  addShape(group: GroupRecord, options: ShapeOptions): ShapeRecord {
    const record: ShapeRecord = {
      id: this.#id(),
      element: options.element,
      kind: options.kind,
      radius: options.radius,
      tint: options.tint,
    };
    group.shapes.set(record.id, record);
    group.dirty = true;
    return record;
  }

  /** 以该元素为根或包含该形状的所有组 */
  groupsOf(element: Element): GroupRecord[] {
    return [...this.groups.values()].filter(
      (group) =>
        group.root === element ||
        [...group.shapes.values()].some((shape) => shape.element === element),
    );
  }

  /** 元素是否仍被任何组或形状引用（决定是否停止观察它） */
  isReferenced(element: Element): boolean {
    return this.groupsOf(element).length > 0;
  }

  markAllDirty(): void {
    for (const group of this.groups.values()) group.dirty = true;
  }

  visibleGroups(): GroupRecord[] {
    return [...this.groups.values()].filter((group) => group.visible);
  }
}
