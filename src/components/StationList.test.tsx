// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StationList from './StationList';
import { LanguageProvider } from '@/i18n';
import type { StationStop } from '@/lib/schedule-data';
import en from '@/i18n/en.json';

afterEach(cleanup);

// Unionville → Union shape: 5 stops, ~10 min apart.
const stops: StationStop[] = [
  { code: 'UI', name: 'Unionville GO', scheduledTime: '08:00', scheduledMinutes: 480 },
  { code: 'MI', name: 'Milliken GO', scheduledTime: '08:10', scheduledMinutes: 490 },
  { code: 'AG', name: 'Agincourt GO', scheduledTime: '08:20', scheduledMinutes: 500 },
  { code: 'KE', name: 'Kennedy GO', scheduledTime: '08:30', scheduledMinutes: 510 },
  { code: 'UN', name: 'Union Station', scheduledTime: '08:45', scheduledMinutes: 525 },
];

/** "HH:MM" + n minutes, same wrap-free range the fixtures use. */
function shift(time: string, min: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function renderList(props: Partial<Parameters<typeof StationList>[0]> = {}) {
  return render(
    <LanguageProvider>
      <StationList
        stops={stops}
        depMins={480}
        nowMinutes={495}
        delayMin={0}
        adjustTimes
        onBoard={false}
        isNext={false}
        {...props}
      />
    </LanguageProvider>
  );
}

describe('StationList', () => {
  it('renders every stop with its scheduled time', () => {
    renderList();
    for (const stop of stops) {
      expect(screen.getByText(stop.name)).toBeTruthy();
      expect(screen.getByText(stop.scheduledTime)).toBeTruthy();
    }
  });

  it('shows no position indicators when not on board', () => {
    renderList({ onBoard: false, nowMinutes: 495 });
    expect(screen.queryByText('← now')).toBeNull();
    expect(screen.queryByText(en.next)).toBeNull();
  });

  it('on board at 08:15 (between Milliken and Agincourt): now-segment + NEXT tag', () => {
    renderList({ onBoard: true, nowMinutes: 495 });
    expect(screen.getByText('← now')).toBeTruthy();
    // The upcoming station is Agincourt.
    const nextTag = screen.getByText(en.next);
    expect(nextTag.parentElement!.textContent).toContain('Agincourt');
  });

  it('a live delay shifts the position back onto the delayed train segment', () => {
    // Wall clock 08:25, but the train runs +10 → effective 08:15,
    // still between Milliken and Agincourt.
    renderList({ onBoard: true, nowMinutes: 505, delayMin: 10 });
    const nextTag = screen.getByText(en.next);
    expect(nextTag.parentElement!.textContent).toContain('Agincourt');
  });

  it('a live delay shifts every stop time, On Board or not', () => {
    // +7 rather than +10 so no shifted time collides with another stop's
    // scheduled time (the fixtures are 10 min apart).
    for (const onBoard of [true, false]) {
      renderList({ onBoard, nowMinutes: 502, delayMin: 7 });
      // Expected times = scheduled + 7, with the scheduled time kept alongside.
      for (const stop of stops) {
        expect(screen.getByText(stop.scheduledTime)).toBeTruthy();
        expect(screen.getByText(shift(stop.scheduledTime, 7))).toBeTruthy();
      }
      expect(screen.getByText(en.delayAdjustedNotice.replace('{min}', '+7'))).toBeTruthy();
      cleanup();
    }
  });

  it('a growing delay re-renders the stop times against the new value', () => {
    const { rerender } = renderList({ onBoard: true, nowMinutes: 505, delayMin: 10 });
    expect(screen.getByText('08:55')).toBeTruthy(); // Union 08:45 +10

    rerender(
      <LanguageProvider>
        <StationList stops={stops} depMins={480} nowMinutes={505} delayMin={22} adjustTimes onBoard isNext={false} />
      </LanguageProvider>
    );
    expect(screen.queryByText('08:55')).toBeNull();
    expect(screen.getByText('09:07')).toBeTruthy(); // Union 08:45 +22
    expect(screen.getByText(en.delayAdjustedNotice.replace('{min}', '+22'))).toBeTruthy();
  });

  it('no delay: scheduled times only, no delay notice', () => {
    renderList({ onBoard: true, nowMinutes: 495, delayMin: 0 });
    for (const stop of stops) expect(screen.getByText(stop.scheduledTime)).toBeTruthy();
    expect(screen.queryByText(en.delayAdjustedNotice.replace('{min}', '+0'))).toBeNull();
  });

  it('adjustTimes off (past / future cards): timetable times even with a delay', () => {
    renderList({ adjustTimes: false, onBoard: true, nowMinutes: 505, delayMin: 10 });
    expect(screen.getByText('08:45')).toBeTruthy();
    expect(screen.queryByText('08:55')).toBeNull();
    expect(screen.queryByText(en.delayAdjustedNotice.replace('{min}', '+10'))).toBeNull();
  });

  it('past the last stop: ARRIVED at the final station, no now-segment', () => {
    renderList({ onBoard: true, nowMinutes: 530 });
    expect(screen.getByText(en.arrived)).toBeTruthy();
    expect(screen.queryByText('← now')).toBeNull();
  });

  it('overnight trip: just-after-midnight now maps onto a >22:00 departure', () => {
    const lateStops: StationStop[] = [
      { code: 'UN', name: 'Union Station', scheduledTime: '23:50', scheduledMinutes: 1430 },
      { code: 'KE', name: 'Kennedy GO', scheduledTime: '24:10', scheduledMinutes: 1450 },
      { code: 'UI', name: 'Unionville GO', scheduledTime: '24:30', scheduledMinutes: 1470 },
    ];
    // 00:15 wall clock (15 min past midnight) during a 23:50 departure →
    // normalized to 1455, between Kennedy (1450) and Unionville (1470).
    render(
      <LanguageProvider>
        <StationList stops={lateStops} depMins={1430} nowMinutes={15} delayMin={0} adjustTimes onBoard isNext={false} />
      </LanguageProvider>
    );
    const nextTag = screen.getByText(en.next);
    expect(nextTag.parentElement!.textContent).toContain('Unionville');
  });
});
