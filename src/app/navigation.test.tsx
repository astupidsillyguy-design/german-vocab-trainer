import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { NAV_DIRECTION_ATTRIBUTE } from '../motion';
import { NavigationProvider, pathFromHref } from './navigation';

function renderNavigation(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <NavigationProvider>
        <Link href="#/archive">归档</Link>
        <Link href="#/archive/42">详情</Link>
        <Link href="#/quiz">测验</Link>
      </NavigationProvider>
    </Router>,
  );
  return location;
}

/** 模拟支持 View Transitions 的浏览器，记录每次过渡开始时的方向 */
function installViewTransitions() {
  const directions: (string | null)[] = [];
  const start = vi.fn((update: () => void) => {
    directions.push(document.documentElement.getAttribute(NAV_DIRECTION_ATTRIBUTE));
    update();
    return { ready: Promise.resolve(), finished: Promise.resolve() };
  });
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
  return { start, directions };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  document.documentElement.removeAttribute(NAV_DIRECTION_ATTRIBUTE);
});

describe('pathFromHref', () => {
  it('去掉 hash 前缀，其余原样返回', () => {
    expect(pathFromHref('#/quiz')).toBe('/quiz');
    expect(pathFromHref('/settings')).toBe('/settings');
  });
});

describe('NavigationProvider', () => {
  it('不支持视图过渡的浏览器直接切换页面', async () => {
    const user = userEvent.setup();
    const location = renderNavigation('/quiz');
    await user.click(screen.getByRole('link', { name: '归档' }));
    expect(location.history.at(-1)).toBe('/archive');
  });

  it('以视图过渡切换：同级为平移，进入下一级为前进，结束后清除方向标记', async () => {
    const user = userEvent.setup();
    const { start, directions } = installViewTransitions();
    const location = renderNavigation('/quiz');
    await user.click(screen.getByRole('link', { name: '归档' }));
    await user.click(screen.getByRole('link', { name: '详情' }));
    await user.click(screen.getByRole('link', { name: '测验' }));
    expect(start).toHaveBeenCalledTimes(3);
    expect(directions).toEqual(['lateral', 'forward', 'back']);
    expect(location.history).toEqual(['/quiz', '/archive', '/archive/42', '/quiz']);
    await vi.waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(NAV_DIRECTION_ATTRIBUTE);
    });
  });

  it('点击当前页的链接不触发过渡，也不重复记入历史', async () => {
    const user = userEvent.setup();
    const { start } = installViewTransitions();
    const location = renderNavigation('/archive');
    await user.click(screen.getByRole('link', { name: '归档' }));
    expect(start).not.toHaveBeenCalled();
    expect(location.history).toEqual(['/archive']);
  });
});
