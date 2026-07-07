// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadWatched, saveWatched, watchKey, WATCHES_STORAGE_KEY } from './push-client';

describe('watched-trips localStorage mirror', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a watch map for the same service day', () => {
    saveWatched('2026-07-06', { [watchKey('Inbound', '17:40')]: '7127' });
    expect(loadWatched('2026-07-06')).toEqual({ 'Inbound:17:40': '7127' });
  });

  it('discards watches from a previous service day', () => {
    saveWatched('2026-07-05', { 'Inbound:17:40': '7127' });
    expect(loadWatched('2026-07-06')).toEqual({});
  });

  it('survives corrupt storage', () => {
    localStorage.setItem(WATCHES_STORAGE_KEY, 'not json {');
    expect(loadWatched('2026-07-06')).toEqual({});
  });

  it('returns {} when nothing is stored', () => {
    expect(loadWatched('2026-07-06')).toEqual({});
  });
});
