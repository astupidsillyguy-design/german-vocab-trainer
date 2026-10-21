/**
 * 首屏与构建生成的预加载器共用同一套选择规则。
 * 保持函数自包含：构建时会把它序列化到同源外部脚本，不使用 eval 或内联脚本。
 */
export function selectLocale<T extends string>(
  stored: unknown,
  preferred: readonly string[],
  supported: readonly T[],
): T | null {
  if (typeof stored === 'string' && supported.includes(stored as T)) return stored as T;
  for (const tag of preferred) {
    if (supported.includes(tag as T)) return tag as T;
    const language = tag.toLowerCase().split('-')[0];
    for (const locale of supported) {
      if (locale.toLowerCase().split('-')[0] === language) return locale;
    }
  }
  return null;
}
