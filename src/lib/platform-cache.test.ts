import { describe, it, expect, beforeEach } from 'vitest';
import { loadPlatformCache, savePlatformCache } from './platform-cache';

// Minimal localStorage stand-in for the node test environment.
function stubLocalStorage() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  return store;
}

describe('platform-cache', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = stubLocalStorage();
  });

  it('round-trips platforms for the same service day', () => {
    savePlatformCache('2026-07-05', { 'officeToHome:17:39': '12, 13' });
    expect(loadPlatformCache('2026-07-05')).toEqual({ 'officeToHome:17:39': '12, 13' });
  });

  it('starts empty on a new service day', () => {
    savePlatformCache('2026-07-04', { 'officeToHome:17:39': '9' });
    expect(loadPlatformCache('2026-07-05')).toEqual({});
  });

  it('discards the poisoned v1 cache and never reads it', () => {
    // v1 entries may hold home-station platforms served by a since-fixed
    // tracker bug; they must be deleted, not migrated.
    store.set(
      'go-train-platform-cache-v1',
      JSON.stringify({ date: '2026-07-05', platforms: { 'officeToHome:10:00': '2' } })
    );
    expect(loadPlatformCache('2026-07-05')).toEqual({});
    expect(store.has('go-train-platform-cache-v1')).toBe(false);
  });

  it('ignores corrupt stored JSON', () => {
    store.set('go-train-platform-cache-v2', 'not json');
    expect(loadPlatformCache('2026-07-05')).toEqual({});
  });
});
