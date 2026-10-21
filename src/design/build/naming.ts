/** camelCase / 数字 → kebab-case，用于把 Token 路径转换成 CSS 变量名。 */
export function kebab(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function cssVarName(...segments: readonly string[]): string {
  return `--${segments.map(kebab).join('-')}`;
}
