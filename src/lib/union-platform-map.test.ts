import { describe, it, expect } from 'vitest';
import {
  MAPPED_PLATFORMS,
  parsePlatformNumbers,
  getMappedPlatforms,
  isPlatformMapped,
} from './union-platform-map';

describe('parsePlatformNumbers', () => {
  it('parses single and multi-platform tracker strings', () => {
    expect(parsePlatformNumbers('7')).toEqual([7]);
    expect(parsePlatformNumbers('12, 13')).toEqual([12, 13]);
    expect(parsePlatformNumbers('7 & 8')).toEqual([7, 8]);
    expect(parsePlatformNumbers('7/8')).toEqual([7, 8]);
    expect(parsePlatformNumbers('12;13')).toEqual([12, 13]);
  });

  it('ignores non-numeric noise', () => {
    expect(parsePlatformNumbers('-')).toEqual([]);
    expect(parsePlatformNumbers('')).toEqual([]);
    expect(parsePlatformNumbers('TBD')).toEqual([]);
  });
});

describe('MAPPED_PLATFORMS', () => {
  it('covers the signed ranges 3–13 and 20–21 on the official map', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21]) {
      expect(MAPPED_PLATFORMS).toContain(n);
    }
  });

  it('never contains platforms 1–2 (UP Express / non-GO)', () => {
    expect(MAPPED_PLATFORMS).not.toContain(1);
    expect(MAPPED_PLATFORMS).not.toContain(2);
  });
});

describe('getMappedPlatforms / isPlatformMapped', () => {
  it('keeps only platforms present on the map', () => {
    expect(getMappedPlatforms('3')).toEqual([3]);
    expect(getMappedPlatforms('13')).toEqual([13]);
    expect(getMappedPlatforms('1, 2')).toEqual([]);
    expect(getMappedPlatforms('2 & 12')).toEqual([12]);
  });

  it('isPlatformMapped mirrors that filter', () => {
    expect(isPlatformMapped('12, 13')).toBe(true);
    expect(isPlatformMapped('1')).toBe(false);
    expect(isPlatformMapped('-')).toBe(false);
  });
});
