/**
 * 运行时数据校验（F-095“外部数据校验”）。
 *
 * 来自应用外部的数据——IndexedDB 中已有的记录、导入的 JSON 文件、同步对端发来的消息——
 * 一律当作 `unknown`，必须经过这里的 schema 才能变成带类型的值。
 *
 * - 白名单：对象只读取声明过的“自有”属性，未知键被丢弃；原型链（包括 `__proto__`）不会被读取或复制；
 * - 先查长度再遍历：超长的字符串或数组直接拒绝，恶意输入无法拖慢主线程；
 * - 错误带路径（如 `[3].answers[0]`），最多收集 MAX_ISSUES 条，便于定位又不会无限增长。
 *
 * 正则不要带 g / y 标志（它们有 lastIndex 状态，重复调用 test() 结果会交替变化）。
 */

export type PathSegment = string | number;

export type IssueCode =
  /** 类型不符 */
  | 'type'
  /** 字符串或数组过短（含必填为空） */
  | 'too_short'
  /** 字符串或数组过长 */
  | 'too_long'
  /** 数字越界 */
  | 'out_of_range'
  /** 不符合格式 */
  | 'pattern'
  /** 不在允许的取值中 */
  | 'enum'
  /** 自定义规则不通过 */
  | 'invalid';

export interface Issue {
  readonly path: readonly PathSegment[];
  readonly code: IssueCode;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export const MAX_ISSUES = 20;

const INVALID: unique symbol = Symbol('invalid');
type Invalid = typeof INVALID;

class Context {
  readonly issues: Issue[] = [];
  readonly #path: PathSegment[] = [];

  get isFull(): boolean {
    return this.issues.length >= MAX_ISSUES;
  }

  report(code: IssueCode): Invalid {
    if (!this.isFull) this.issues.push({ path: [...this.#path], code });
    return INVALID;
  }

  at<T>(segment: PathSegment, run: () => T): T {
    this.#path.push(segment);
    try {
      return run();
    } finally {
      this.#path.pop();
    }
  }
}

type Checker<T> = (input: unknown, context: Context) => T | Invalid;

export interface Schema<T> {
  readonly optional: false;
  /** 由组合子内部调用；外部请使用 parse() */
  readonly check: Checker<T>;
}

/** 只能用作 object() 的字段：值为 undefined 或缺省时，输出中不出现该键 */
export interface OptionalSchema<T> {
  readonly optional: true;
  readonly check: Checker<T | undefined>;
}

type AnySchema = Schema<unknown> | OptionalSchema<unknown>;

export type Infer<S> =
  S extends Schema<infer T> ? T : S extends OptionalSchema<infer T> ? Exclude<T, undefined> : never;

function define<T>(check: Checker<T>): Schema<T> {
  return { optional: false, check };
}

export function parse<T>(schema: Schema<T>, input: unknown): ParseResult<T> {
  const context = new Context();
  const value = schema.check(input, context);
  return value === INVALID ? { ok: false, issues: context.issues } : { ok: true, value };
}

/** 把错误路径写成 `[3].answers[0]` 的形式，便于日志与隔离记录 */
export function formatIssue({ path, code }: Issue): string {
  const location = path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`))
    .join('')
    .replace(/^\./u, '');
  return location === '' ? code : `${location}: ${code}`;
}

// —— 基础类型 ——

export interface StringOptions {
  readonly min?: number;
  /** 必填：所有外部字符串都必须有上限 */
  readonly max: number;
  readonly pattern?: RegExp;
}

export function string({ min = 0, max, pattern }: StringOptions): Schema<string> {
  return define((input, context) => {
    if (typeof input !== 'string') return context.report('type');
    if (input.length > max) return context.report('too_long');
    if (input.length < min) return context.report('too_short');
    if (pattern !== undefined && !pattern.test(input)) return context.report('pattern');
    return input;
  });
}

export interface NumberOptions {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

export function number({ min, max, integer = false }: NumberOptions): Schema<number> {
  return define((input, context) => {
    if (typeof input !== 'number' || !Number.isFinite(input)) return context.report('type');
    if (integer && !Number.isInteger(input)) return context.report('type');
    if (input < min || input > max) return context.report('out_of_range');
    return input;
  });
}

export function boolean(): Schema<boolean> {
  return define((input, context) => (typeof input === 'boolean' ? input : context.report('type')));
}

type Primitive = string | number | boolean;

function isOneOf<const T extends readonly Primitive[]>(
  values: T,
  input: unknown,
): input is T[number] {
  return values.includes(input as T[number]);
}

export function literal<const T extends readonly Primitive[]>(...values: T): Schema<T[number]> {
  return define((input, context) => (isOneOf(values, input) ? input : context.report('enum')));
}

// —— 组合 ——

export interface ArrayOptions {
  readonly min?: number;
  /** 必填：所有外部数组都必须有上限 */
  readonly max: number;
}

export function array<T>(item: Schema<T>, { min = 0, max }: ArrayOptions): Schema<readonly T[]> {
  return define((input, context) => {
    if (!Array.isArray(input)) return context.report('type');
    const list: readonly unknown[] = input;
    if (list.length > max) return context.report('too_long');
    if (list.length < min) return context.report('too_short');
    const output: T[] = [];
    let failed = false;
    for (let index = 0; index < list.length; index += 1) {
      const value = context.at(index, () => item.check(list[index], context));
      if (value === INVALID) {
        failed = true;
        if (context.isFull) break;
      } else {
        output.push(value);
      }
    }
    return failed ? INVALID : output;
  });
}

export type NonEmptyList<T> = readonly [T, ...T[]];

export function nonEmptyArray<T>(
  item: Schema<T>,
  { max }: Pick<ArrayOptions, 'max'>,
): Schema<NonEmptyList<T>> {
  const inner = array(item, { min: 1, max });
  return define((input, context) => {
    const value = inner.check(input, context);
    if (value === INVALID) return INVALID;
    const [first, ...rest] = value;
    return first === undefined ? context.report('too_short') : [first, ...rest];
  });
}

export type Shape = Readonly<Record<string, AnySchema>>;

type RequiredKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalSchema<unknown> ? never : K;
}[keyof S];

type OptionalKeys<S extends Shape> = Exclude<keyof S, RequiredKeys<S>>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type ObjectOutput<S extends Shape> = Simplify<
  { readonly [K in RequiredKeys<S>]: Infer<S[K]> } & {
    readonly [K in OptionalKeys<S>]?: Infer<S[K]>;
  }
>;

/** 普通对象（不是 null，也不是数组） */
export function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export function object<S extends Shape>(shape: S): Schema<ObjectOutput<S>> {
  const fields = Object.entries(shape);
  return define((input, context) => {
    if (!isRecord(input)) return context.report('type');
    const output: Record<string, unknown> = {};
    let failed = false;
    for (const [key, field] of fields) {
      const raw = Object.hasOwn(input, key) ? input[key] : undefined;
      const value = context.at(key, () => field.check(raw, context));
      if (value === INVALID) {
        failed = true;
        if (context.isFull) break;
      } else if (value !== undefined) {
        output[key] = value;
      }
    }
    // 输出对象的键完全来自 shape，与 ObjectOutput<S> 一一对应
    return failed ? INVALID : (output as ObjectOutput<S>);
  });
}

export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return {
    optional: true,
    check: (input, context) => (input === undefined ? undefined : inner.check(input, context)),
  };
}

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return define((input, context) => (input === null ? null : inner.check(input, context)));
}

/** 在通过基础校验后追加规则；传入类型守卫时可收窄输出类型（例如品牌类型） */
export function refine<T, U extends T>(
  inner: Schema<T>,
  predicate: (value: T) => value is U,
): Schema<U>;
export function refine<T>(inner: Schema<T>, predicate: (value: T) => boolean): Schema<T>;
export function refine<T>(inner: Schema<T>, predicate: (value: T) => boolean): Schema<T> {
  return define((input, context) => {
    const value = inner.check(input, context);
    if (value === INVALID) return INVALID;
    return predicate(value) ? value : context.report('invalid');
  });
}

export function map<T, U>(inner: Schema<T>, transform: (value: T) => U): Schema<U> {
  return define((input, context) => {
    const value = inner.check(input, context);
    return value === INVALID ? INVALID : transform(value);
  });
}

/**
 * 带标签的联合类型：按判别字段 `key` 的取值选择分支 schema，再用该分支校验整个对象。
 * 每个分支都应在自己的 shape 中声明 `key: literal('分支名')`，输出类型因此可以按 key 收窄。
 * 判别值缺失或不在分支中时报 enum（路径指向判别字段）。
 */
export function variant<const Branches extends Readonly<Record<string, Schema<unknown>>>>(
  key: string,
  branches: Branches,
): Schema<Infer<Branches[keyof Branches]>> {
  return define((input, context) => {
    if (!isRecord(input)) return context.report('type');
    const tag = Object.hasOwn(input, key) ? input[key] : undefined;
    const branch =
      typeof tag === 'string' && Object.hasOwn(branches, tag) ? branches[tag] : undefined;
    if (branch === undefined) return context.at(key, () => context.report('enum'));
    // 分支的输出类型属于 Branches[keyof Branches]，泛型无法自动推导这一点
    return branch.check(input, context) as Infer<Branches[keyof Branches]> | Invalid;
  });
}
