export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { readonly other: string };

const rulesCache = new Map<string, Intl.PluralRules>();

function rulesFor(locale: string): Intl.PluralRules {
  let rules = rulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    rulesCache.set(locale, rules);
  }
  return rules;
}

/** 按 CLDR 复数规则选择文案（中文、日文只有 other，英文、德文区分 one / other）。 */
export function plural(locale: string, count: number, forms: PluralForms): string {
  return forms[rulesFor(locale).select(count)] ?? forms.other;
}
