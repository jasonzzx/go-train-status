// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LINE_STORAGE_KEY,
  HOME_STATION_STORAGE_KEY,
  homeStationKey,
  loadHomeStation,
  loadLineId,
} from './preferences';
import { getLine, DEFAULT_LINE_ID } from './lines';

beforeEach(() => {
  localStorage.clear();
});

describe('loadLineId', () => {
  it('defaults when nothing is stored', () => {
    expect(loadLineId()).toBe(DEFAULT_LINE_ID);
  });

  it('returns a stored valid line', () => {
    localStorage.setItem(LINE_STORAGE_KEY, 'LW');
    expect(loadLineId()).toBe('LW');
  });

  it('falls back to the default for an unknown line id', () => {
    localStorage.setItem(LINE_STORAGE_KEY, 'XX');
    expect(loadLineId()).toBe(DEFAULT_LINE_ID);
  });
});

describe('loadHomeStation', () => {
  const st = getLine('ST');
  const lw = getLine('LW');

  it('defaults to the line default when nothing is stored', () => {
    expect(loadHomeStation(st)).toBe(st.defaultHomeCode);
    expect(loadHomeStation(lw)).toBe(lw.defaultHomeCode);
  });

  it('returns the per-line stored station', () => {
    const code = lw.homeStations[1].code;
    localStorage.setItem(homeStationKey('LW'), code);
    expect(loadHomeStation(lw)).toBe(code);
  });

  it('reads the legacy un-suffixed key for Stouffville only', () => {
    const code = st.homeStations[1].code;
    localStorage.setItem(HOME_STATION_STORAGE_KEY, code);
    expect(loadHomeStation(st)).toBe(code);
    expect(loadHomeStation(lw)).toBe(lw.defaultHomeCode);
  });

  it('migrates pre-GTFS Stouffville codes', () => {
    localStorage.setItem(homeStationKey('ST'), 'ML'); // legacy Milliken code
    expect(loadHomeStation(st)).toBe('MK');
  });

  it('falls back to the line default for a code not on the line', () => {
    localStorage.setItem(homeStationKey('LW'), 'ZZ');
    expect(loadHomeStation(lw)).toBe(lw.defaultHomeCode);
  });
});
