// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import PlatformMapSheet from './PlatformMapSheet';
import { LanguageProvider } from '@/i18n';
import { UNION_STATION_COORDS } from '@/lib/union-map';
import { MAPPED_PLATFORMS } from '@/lib/union-platform-map';
import en from '@/i18n/en.json';

// 09:00 America/Toronto — departures below are relative to this.
const FROZEN_NOW = new Date('2026-07-06T13:00:00.000Z');

const mappedPlatform = String(MAPPED_PLATFORMS[0]);

type GeoScript =
  | { kind: 'ok'; lat: number; lon: number }
  | { kind: 'denied' }
  | { kind: 'none' };

function stubGeolocation(script: GeoScript) {
  if (script.kind === 'none') {
    // jsdom has no navigator.geolocation by default — nothing to stub.
    return;
  }
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (
        ok: (pos: { coords: { latitude: number; longitude: number } }) => void,
        err: (e: { code: number; PERMISSION_DENIED: number }) => void
      ) => {
        if (script.kind === 'ok') ok({ coords: { latitude: script.lat, longitude: script.lon } });
        else err({ code: 1, PERMISSION_DENIED: 1 });
        return 1;
      },
      clearWatch: () => {},
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  cleanup();
  // @ts-expect-error – remove the per-test geolocation stub
  delete window.navigator.geolocation;
  vi.useRealTimers();
});

function renderSheet(props: { platform?: string; departure?: string; delayMin?: number } = {}) {
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <PlatformMapSheet
        platform={props.platform ?? mappedPlatform}
        departure={props.departure ?? '10:00'}
        delayMin={props.delayMin ?? 0}
        onClose={onClose}
      />
    </LanguageProvider>
  );
  return onClose;
}

describe('PlatformMapSheet', () => {
  it('shows the platform in the header and the zoom toggle for mapped platforms', () => {
    stubGeolocation({ kind: 'none' });
    renderSheet();
    expect(screen.getByText(en.platformMapTitle.replace('{platform}', mappedPlatform))).toBeTruthy();
    // Starts zoomed in, offering to zoom back out to the full map.
    expect(screen.getByText(new RegExp(en.viewFullMap))).toBeTruthy();
  });

  it('unmapped platform: fallback message, no zoom toggle', () => {
    stubGeolocation({ kind: 'none' });
    renderSheet({ platform: '99' });
    expect(screen.getByText(en.platformMapUnavailable)).toBeTruthy();
    expect(screen.queryByText(new RegExp(en.viewFullMap))).toBeNull();
  });

  it('no geolocation API: location unavailable', () => {
    stubGeolocation({ kind: 'none' });
    renderSheet();
    expect(screen.getByText(en.locationUnavailable)).toBeTruthy();
  });

  it('permission denied: denied message', () => {
    stubGeolocation({ kind: 'denied' });
    renderSheet();
    expect(screen.getByText(en.locationDenied)).toBeTruthy();
  });

  it('at Union (≤250 m): at-station confirmation', () => {
    stubGeolocation({ kind: 'ok', lat: UNION_STATION_COORDS.lat, lon: UNION_STATION_COORDS.lon });
    renderSheet();
    expect(screen.getByText(en.atStation)).toBeTruthy();
  });

  it('~1 km away, plenty of time: walk estimate + leave-by time', () => {
    // ~0.9 km north of Union.
    stubGeolocation({ kind: 'ok', lat: UNION_STATION_COORDS.lat + 0.008, lon: UNION_STATION_COORDS.lon });
    renderSheet({ departure: '10:00' });
    expect(screen.getByText(/🚶/).textContent).toContain('min');
    expect(screen.getByText(en.leaveBy)).toBeTruthy();
    expect(screen.queryByText(en.leaveNow)).toBeNull();
  });

  it('departure imminent: flips to LEAVE NOW', () => {
    stubGeolocation({ kind: 'ok', lat: UNION_STATION_COORDS.lat + 0.008, lon: UNION_STATION_COORDS.lon });
    // Departs 09:05 — 5 minutes from the frozen clock, under the walk time.
    renderSheet({ departure: '09:05' });
    expect(screen.getByText(en.leaveNow)).toBeTruthy();
  });

  it('too far to walk (>3 km): distance only', () => {
    stubGeolocation({ kind: 'ok', lat: UNION_STATION_COORDS.lat + 0.05, lon: UNION_STATION_COORDS.lon });
    renderSheet();
    expect(screen.getByText(new RegExp(en.distanceAway.replace('{km}', '\\d+(\\.\\d+)?')))).toBeTruthy();
    expect(screen.queryByText(en.leaveBy)).toBeNull();
  });

  it('a live delay pushes the leave-by time later', () => {
    stubGeolocation({ kind: 'ok', lat: UNION_STATION_COORDS.lat + 0.008, lon: UNION_STATION_COORDS.lon });
    renderSheet({ departure: '10:00', delayMin: 30 });
    // Leave-by is displayed as HH:MM; with +30 delay it must be 10:0x-ish,
    // strictly later than the no-delay case (10:00 minus walk minutes).
    const leaveBy = screen.getByText(en.leaveBy).nextElementSibling!.textContent!;
    expect(leaveBy >= '10:00').toBe(true);
  });

  it('close via ✕', () => {
    stubGeolocation({ kind: 'none' });
    const onClose = renderSheet();
    act(() => {
      screen.getByText('✕').click();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
