import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { sizeClassMinWidth } from '../../design/tokens';
import { setViewportWidth } from '../../test/viewport';
import { mergeRefs } from '../hooks/mergeRefs';
import { useControllableState } from '../hooks/useControllableState';
import { sizeClassForWidth, syncSizeClassAttribute, useSizeClass } from '../hooks/useSizeClass';

describe('useControllableState', () => {
  it('非受控时维护内部状态并回调', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState<string | undefined>(undefined, 'a', onChange),
    );
    act(() => {
      result.current[1]('b');
    });
    expect(result.current[0]).toBe('b');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('受控时只回调，不改变显示值', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useControllableState<string>('fixed', 'a', onChange));
    act(() => {
      result.current[1]('b');
    });
    expect(result.current[0]).toBe('fixed');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('sizeClassForWidth', () => {
  it('按断点映射尺寸等级（含边界）', () => {
    expect(sizeClassForWidth(0)).toBe('compact');
    expect(sizeClassForWidth(sizeClassMinWidth.regular - 1)).toBe('compact');
    expect(sizeClassForWidth(sizeClassMinWidth.regular)).toBe('regular');
    expect(sizeClassForWidth(sizeClassMinWidth.expanded - 1)).toBe('regular');
    expect(sizeClassForWidth(sizeClassMinWidth.expanded)).toBe('expanded');
  });
});

describe('useSizeClass', () => {
  it('跨越断点时更新', () => {
    const { result } = renderHook(() => useSizeClass());
    expect(result.current).toBe('compact');
    act(() => {
      setViewportWidth(sizeClassMinWidth.expanded);
    });
    expect(result.current).toBe('expanded');
  });
});

describe('syncSizeClassAttribute', () => {
  it('写入 data-size-class 并随断点更新，取消后不再更新', () => {
    const root = document.createElement('div');
    const stop = syncSizeClassAttribute(root);
    expect(root.dataset.sizeClass).toBe('compact');
    setViewportWidth(sizeClassMinWidth.regular);
    expect(root.dataset.sizeClass).toBe('regular');
    stop();
    setViewportWidth(sizeClassMinWidth.expanded);
    expect(root.dataset.sizeClass).toBe('regular');
  });
});

describe('mergeRefs', () => {
  it('同时写入对象 ref 与回调 ref，并在卸载时清理', () => {
    const objectRef = createRef<HTMLDivElement>();
    const callback = vi.fn();
    const merged = mergeRefs(objectRef, callback);
    const element = document.createElement('div');

    const cleanup = merged(element);
    expect(objectRef.current).toBe(element);
    expect(callback).toHaveBeenLastCalledWith(element);

    if (typeof cleanup === 'function') cleanup();
    expect(objectRef.current).toBeNull();
    expect(callback).toHaveBeenLastCalledWith(null);
  });
});
