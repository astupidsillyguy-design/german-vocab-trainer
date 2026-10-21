/**
 * 可控的 matchMedia 模拟：测试中调用 setViewportWidth() 即可切换尺寸等级，
 * setMediaQuery() 可直接指定任意查询（如降低透明度）的结果；
 * 已注册的监听器会像真实浏览器一样收到 change 事件。
 */
const DEFAULT_WIDTH = 390;
const MIN_WIDTH_QUERY = /\(min-width:\s*(\d+)px\)/;
const MAX_WIDTH_QUERY = /\(max-width:\s*(\d+)px\)/;
const REDUCED_MOTION_QUERY = /prefers-reduced-motion:\s*reduce/;

let width = DEFAULT_WIDTH;
let reducedMotion = false;
/** 按查询字符串精确匹配的覆盖值 */
const overrides = new Map<string, boolean>();
const lists = new Set<FakeMediaQueryList>();

function evaluate(query: string): boolean {
  const override = overrides.get(query);
  if (override !== undefined) return override;
  const min = MIN_WIDTH_QUERY.exec(query);
  if (min?.[1] !== undefined) return width >= Number(min[1]);
  const max = MAX_WIDTH_QUERY.exec(query);
  if (max?.[1] !== undefined) return width <= Number(max[1]);
  if (REDUCED_MOTION_QUERY.test(query)) return reducedMotion;
  return false;
}

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string;
  matches: boolean;
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;

  constructor(media: string) {
    super();
    this.media = media;
    this.matches = evaluate(media);
  }

  /** 旧版 API，部分库仍在使用 */
  addListener(listener: (event: MediaQueryListEvent) => void): void {
    this.addEventListener('change', listener as EventListener);
  }

  removeListener(listener: (event: MediaQueryListEvent) => void): void {
    this.removeEventListener('change', listener as EventListener);
  }

  refresh(): void {
    const next = evaluate(this.media);
    if (next === this.matches) return;
    this.matches = next;
    this.dispatchEvent(new Event('change'));
  }
}

function install(): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const list = new FakeMediaQueryList(query);
    lists.add(list);
    return list;
  };
}

export function setViewportWidth(next: number): void {
  width = next;
  for (const list of lists) list.refresh();
}

export function setReducedMotion(next: boolean): void {
  reducedMotion = next;
  for (const list of lists) list.refresh();
}

/** 指定某个媒体查询（按字符串精确匹配）的结果 */
export function setMediaQuery(query: string, matches: boolean): void {
  overrides.set(query, matches);
  for (const list of lists) list.refresh();
}

export function resetViewport(): void {
  width = DEFAULT_WIDTH;
  reducedMotion = false;
  overrides.clear();
  lists.clear();
  install();
}
