import { describe, it, expect } from 'vitest';
import { resolveDeparturePlatform, resolveRailsixPlatform } from './platform-resolve';

// INVARIANT under guard: a platform always refers to the DEPARTURE station.
// Outbound departs Union → only Union sources. Inbound departs the home
// station → only home-station sources. Cross-station values must never leak,
// even when they are the only data available.

const none = {
  unionLive: '',
  unionStored: '',
  homeLive: '',
  homeStored: '',
  depSoon: true,
};

describe('resolveDeparturePlatform — Outbound (departs Union)', () => {
  it('uses the live Union platform', () => {
    expect(
      resolveDeparturePlatform({ ...none, directionCd: 'Outbound', unionLive: '12, 13' })
    ).toBe('12, 13');
  });

  it('falls back to the stored Union platform', () => {
    expect(
      resolveDeparturePlatform({ ...none, directionCd: 'Outbound', unionStored: '4' })
    ).toBe('4');
  });

  it('NEVER shows a home-station (arrival) platform, even as the only data', () => {
    expect(
      resolveDeparturePlatform({
        ...none,
        directionCd: 'Outbound',
        homeLive: '2',
        homeStored: '1',
      })
    ).toBe('');
  });

  it('prefers live over stored Union data', () => {
    expect(
      resolveDeparturePlatform({
        ...none,
        directionCd: 'Outbound',
        unionLive: '9',
        unionStored: '4',
      })
    ).toBe('9');
  });
});

describe('resolveDeparturePlatform — Inbound (departs home station)', () => {
  it('uses the live home-station scheduled platform near departure', () => {
    expect(
      resolveDeparturePlatform({ ...none, directionCd: 'Inbound', homeLive: '2' })
    ).toBe('2');
  });

  it('falls back to the stored home-station platform', () => {
    expect(
      resolveDeparturePlatform({ ...none, directionCd: 'Inbound', homeStored: '1' })
    ).toBe('1');
  });

  it('NEVER shows a Union (arrival) platform, even as the only data', () => {
    // UnionDepartures data matching an Inbound trip number is the platform
    // the train arrives at — showing it would send riders to the wrong track.
    expect(
      resolveDeparturePlatform({
        ...none,
        directionCd: 'Inbound',
        unionLive: '12, 13',
        unionStored: '7',
      })
    ).toBe('');
  });

  it('NEVER lets Union data outrank home data', () => {
    expect(
      resolveDeparturePlatform({
        ...none,
        directionCd: 'Inbound',
        unionLive: '12, 13',
        homeLive: '2',
      })
    ).toBe('2');
  });

  it('shows nothing far from departure even when a scheduled platform is known', () => {
    expect(
      resolveDeparturePlatform({
        ...none,
        directionCd: 'Inbound',
        homeLive: '2',
        homeStored: '1',
        depSoon: false,
      })
    ).toBe('');
  });
});

describe('resolveRailsixPlatform', () => {
  it('shows the feed platform near departure', () => {
    expect(
      resolveRailsixPlatform({ feedPlatform: '3', departsSoon: true, departed: false, stored: '' })
    ).toBe('3');
  });

  it('suppresses the feed platform far from departure (all-day scheduled mirror)', () => {
    expect(
      resolveRailsixPlatform({ feedPlatform: '3', departsSoon: false, departed: false, stored: '' })
    ).toBe('');
  });

  it('backfills a departed trip from the store', () => {
    expect(
      resolveRailsixPlatform({ feedPlatform: '', departsSoon: true, departed: true, stored: '8' })
    ).toBe('8');
  });

  it('never backfills a future trip from the store', () => {
    expect(
      resolveRailsixPlatform({ feedPlatform: '', departsSoon: true, departed: false, stored: '8' })
    ).toBe('');
  });
});
