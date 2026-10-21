import { describe, expect, it } from 'vitest';
import { MQTT_BROKER_URL } from '../src/sync/constants.ts';
import {
  headerPolicy,
  headersForPath,
  metaPolicy,
  renderHeadersFile,
  securityHeaders,
} from './security-headers.ts';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...sources] = directive.split(' ');
      return [name, sources];
    }),
  );
}

describe('内容安全策略', () => {
  const policy = directives(headerPolicy());

  it('默认只允许本站，禁止插件、外部表单与改写 base', () => {
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('form-action')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('脚本只允许本站文件：没有内联、eval 与外部来源', () => {
    expect(policy.get('script-src')).toEqual(["'self'"]);
    for (const sources of policy.values()) {
      expect(sources).not.toContain("'unsafe-eval'");
      expect(sources).not.toContain('*');
    }
  });

  it('网络连接只有本站与设备同步的信令服务器', () => {
    expect(policy.get('connect-src')).toEqual(["'self'", new URL(MQTT_BROKER_URL).origin]);
  });

  it('允许 Service Worker 与 Manifest（离线与安装）', () => {
    expect(policy.get('worker-src')).toEqual(["'self'"]);
    expect(policy.get('manifest-src')).toEqual(["'self'"]);
  });

  it('meta 版本不含只能放在响应头里的 frame-ancestors，其余相同', () => {
    expect(metaPolicy()).not.toContain('frame-ancestors');
    expect(headerPolicy().startsWith(metaPolicy())).toBe(true);
  });
});

describe('安全响应头', () => {
  const headers = securityHeaders();

  it('包含常见的加固项', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Content-Security-Policy']).toBe(headerPolicy());
  });

  it('摄像头只对本站开放（扫码配对），麦克风与定位关闭', () => {
    const permissions = headers['Permissions-Policy'] ?? '';
    expect(permissions).toContain('camera=(self)');
    expect(permissions).toContain('microphone=()');
    expect(permissions).toContain('geolocation=()');
  });
});

describe('_headers 文件', () => {
  const file = renderHeadersFile();

  it('全站规则含全部安全响应头', () => {
    const block = file.split('\n\n')[0] ?? '';
    expect(block.startsWith('/*\n')).toBe(true);
    for (const [name, value] of Object.entries(securityHeaders())) {
      expect(block).toContain(`  ${name}: ${value}`);
    }
  });

  it('哈希文件永久缓存，入口、Service Worker 与 manifest 每次校验', () => {
    expect(file).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    for (const path of ['/', '/index.html', '/sw.js']) {
      expect(file).toContain(`\n${path}\n  Cache-Control: no-cache`);
    }
    expect(file).toMatch(/\/manifest\.webmanifest\n {2}Content-Type: application\/manifest\+json/);
  });

  it('以换行结尾', () => {
    expect(file.endsWith('\n')).toBe(true);
  });
});

describe('headersForPath', () => {
  it('所有路径都带安全响应头', () => {
    for (const path of ['/', '/index.html', '/assets/a.js', '/whatever']) {
      expect(headersForPath(path)['X-Content-Type-Options']).toBe('nosniff');
    }
  });

  it('带哈希的资源永久缓存，入口与 Service Worker 每次校验', () => {
    expect(headersForPath('/assets/index-abc.js')['Cache-Control']).toContain('immutable');
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      expect(headersForPath(path)['Cache-Control']).toBe('no-cache');
    }
  });

  it('没有专门规则的路径不带缓存头；manifest 有专用类型', () => {
    expect(headersForPath('/favicon.svg')['Cache-Control']).toBeUndefined();
    expect(headersForPath('/manifest.webmanifest')['Content-Type']).toBe(
      'application/manifest+json',
    );
  });
});
