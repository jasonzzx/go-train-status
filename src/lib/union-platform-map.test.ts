import { describe, it, expect } from 'vitest';
import {
  parsePlatformNumbers,
  getMappedPlatforms,
  isPlatformMapped,
  getPlatformLabelKey,
} from './union-platform-map';

describe('parsePlatformNumbers', () => {
  it('parses single and multi-platform tracker strings', () => {
    expect(parsePlatformNumbers('7')).toEqual([7]);
    expect(parsePlatformNumbers('12, 13')).toEqual([12, 13]);
    expect(parsePlatformNumbers('7 & 8')).toEqual([7, 8]);
    expect(parsePlatformNumbers('7/8')).toEqual([7, 8]);
  });

  it('ignores non-numeric noise', () => {
    expect(parsePlatformNumbers('-')).toEqual([]);
    expect(parsePlatformNumbers('')).toEqual([]);
    expect(parsePlatformNumbers('TBD')).toEqual([]);
  });
});

describe('getMappedPlatforms / isPlatformMapped', () => {
  it('keeps only platforms 3–13 (the drawn range)', () => {
    expect(getMappedPlatforms('3')).toEqual([3]);
    expect(getMappedPlatforms('13')).toEqual([13]);
    expect(getMappedPlatforms('1, 2')).toEqual([]);
    expect(getMappedPlatforms('2 & 14')).toEqual([]);
    expect(getMappedPlatforms('2 & 12')).toEqual([12]);
  });

  it('isPlatformMapped mirrors that filter', () => {
    expect(isPlatformMapped('12, 13')).toBe(true);
    expect(isPlatformMapped('1')).toBe(false);
    expect(isPlatformMapped('-')).toBe(false);
  });
});

describe('getPlatformLabelKey', () => {
  it('labels west-walkway platforms distinctly', () => {
    expect(getPlatformLabelKey(4)).toBe('platformZoneWestWalkway');
    expect(getPlatformLabelKey(11)).toBe('platformZoneWestWalkway');
    expect(getPlatformLabelKey(3)).toBe('platformZoneYorkConcourse');
    expect(getPlatformLabelKey(8)).toBe('platformZoneYorkConcourse');
  });
});
