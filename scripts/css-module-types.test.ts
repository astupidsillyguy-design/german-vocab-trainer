import { describe, expect, it } from 'vitest';
import { declarationPathFor, extractClassNames, renderDeclaration } from './css-module-types.ts';

describe('extractClassNames', () => {
  it('提取选择器中的类名并排序去重', () => {
    const css = `
      .button { color: red; }
      .button[data-pressed] .label, .icon:hover { opacity: 0.5; }
    `;
    expect(extractClassNames(css)).toEqual(['button', 'icon', 'label']);
  });

  it('忽略注释、声明值中的小数与 at-rule 条件', () => {
    const css = `
      /* .commented { } */
      @media (min-resolution: 1.5dppx) { .retina { inline-size: 0.5px; } }
      @keyframes fadeIn { from { opacity: 0; } }
      @supports (corner-shape: squircle) { .surface { corner-shape: squircle; } }
    `;
    expect(extractClassNames(css)).toEqual(['retina', 'surface']);
  });
});

describe('renderDeclaration', () => {
  it('合法标识符直接作为键，其他名称加引号', () => {
    const output = renderDeclaration(['button', 'is-active']);
    expect(output).toContain('readonly button: string;');
    expect(output).toContain("readonly 'is-active': string;");
    expect(output).toContain('export default styles;');
  });
});

describe('declarationPathFor', () => {
  it('生成 TS allowArbitraryExtensions 约定的文件名', () => {
    expect(declarationPathFor('/a/Button.module.css')).toBe('/a/Button.module.d.css.ts');
  });
});
