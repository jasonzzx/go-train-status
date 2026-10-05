// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import TrainCard from './TrainCard';
import { LanguageProvider } from '@/i18n';
import { getScheduleForStation, timeToMinutes } from '@/lib/schedule-data';
import { MAPPED_PLATFORMS } from '@/lib/union-platform-map';
import type { TrackerInfo } from '@/lib/tracker-info';
import type { ParsedAlert } from '@/app/api/alerts/route';
import en from '@/i18n/en.json';
import { scheduledArrivalAt, reminderId, type ArrivalReminder } from '@/lib/arrival-reminder';

afterEach(cleanup);

// A real weekday ST trip so getStops() resolves genuine GTFS stop times.
const trip = getScheduleForStation('ST', 'homeToOffice', 'weekday', 'UI')[0];
const depMins = timeToMinutes(trip.departure);

function tracker(overrides: Partial<TrackerInfo> = {}): TrackerInfo {
  return { platform: '', expected: trip.departure, delay: 0, cancelled: false, arriveIn: '', ...overrides };
}

type Props = Parameters<typeof TrainCard>[0];

function renderCard(overrides: Partial<Props> = {}) {
  const props: Props = {
    trip,
    isNext: false,
    isPast: false,
    alerts: [],
    tracker: null,
    direction: 'homeToOffice',
    lineId: 'ST',
    homeStationCode: 'UI',
    nowMinutes: depMins - 60,
    isToday: true,
    isExpanded: false,
    isOnBoard: false,
    liveStops: [],
    onToggleExpand: vi.fn(),
    onToggleOnBoard: vi.fn(),
    onAlertClick: vi.fn(),
    onPlatformClick: vi.fn(),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <TrainCard {...props} />
    </LanguageProvider>
  );
  return props;
}

describe('TrainCard basics', () => {
  it('renders departure/arrival times and the vehicle badge', () => {
    renderCard();
    // Times also appear as stop rows in the (collapsed) station list.
    expect(screen.getAllByText(trip.departure).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(trip.arrival).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(trip.vehicleType === 'train' ? en.train : en.bus)).toBeTruthy();
  });

  it('header click toggles expansion; expanded card shows the stop list', () => {
    const props = renderCard({ isExpanded: true });
    // Expanded: every stop time from the trip renders.
    expect(screen.getAllByText(trip.departure).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByText(en.depart).closest('button')!);
    expect(props.onToggleExpand).toHaveBeenCalledOnce();
  });

  it('alert badge shows only with alerts and fires onAlertClick', () => {
    renderCard();
    expect(screen.queryByText('⚠️')).toBeNull();
    cleanup();

    const props = renderCard({ alerts: [{ title: 'Delay' } as ParsedAlert] });
    fireEvent.click(screen.getByText('⚠️'));
    expect(props.onAlertClick).toHaveBeenCalledOnce();
    expect(props.onToggleExpand).not.toHaveBeenCalled();
  });
});

describe('NEXT card', () => {
  it('shows the NEXT badge and a live countdown even without tracker data', () => {
    renderCard({ isNext: true, tracker: null });
    expect(screen.getByText(en.nextBadge)).toBeTruthy();
    expect(screen.getByText(en.departsIn)).toBeTruthy();
  });

  it('no countdown on future dates (not today)', () => {
    renderCard({ isNext: false, isToday: false, nowMinutes: null });
    expect(screen.queryByText(en.departsIn)).toBeNull();
  });

  it('cancelled NEXT trip: cancelled badge, no countdown', () => {
    renderCard({ isNext: true, tracker: tracker({ cancelled: true }) });
    expect(screen.getByText(en.cancelled)).toBeTruthy();
    expect(screen.queryByText(en.departsIn)).toBeNull();
  });

  it('delayed NEXT trip shows the delay badge', () => {
    renderCard({ isNext: true, tracker: tracker({ delay: 7 }) });
    expect(screen.getByText(en.delayMin.replace('{min}', '7'))).toBeTruthy();
  });

  it('on-time NEXT trip shows the on-time badge', () => {
    renderCard({ isNext: true, tracker: tracker() });
    expect(screen.getByText(en.onTime)).toBeTruthy();
  });
});

describe('platform chip visibility spec', () => {
  // NOW always · NEXT live-only (page passes live value) · past only when
  // expanded · future never.
  it('NEXT: platform chip visible when a live platform exists', () => {
    renderCard({ isNext: true, tracker: tracker({ platform: '3' }) });
    expect(screen.getByText(en.platform)).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('NOW (running): platform chip always visible', () => {
    renderCard({
      isPast: true, // departure has passed
      nowMinutes: depMins + 5,
      tracker: tracker({ platform: '3' }),
    });
    expect(screen.getByText(en.nowBadge)).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('past (arrived): platform hidden collapsed, shown when expanded', () => {
    renderCard({ isPast: true, nowMinutes: depMins + 600, tracker: tracker({ platform: '3' }) });
    expect(screen.queryByText('3')).toBeNull();
    cleanup();

    renderCard({ isPast: true, nowMinutes: depMins + 600, tracker: tracker({ platform: '3' }), isExpanded: true });
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('future card below NEXT: never shows a platform, even expanded', () => {
    renderCard({ tracker: tracker({ platform: '3' }), isExpanded: true, nowMinutes: depMins - 60 });
    expect(screen.queryByText(en.platform)).toBeNull();
  });

  it('Union departure with a mapped platform opens the platform map', () => {
    const mapped = String(MAPPED_PLATFORMS[0]);
    const props = renderCard({
      isNext: true,
      direction: 'officeToHome',
      tracker: tracker({ platform: mapped }),
    });
    fireEvent.click(screen.getByText(mapped));
    expect(props.onPlatformClick).toHaveBeenCalledWith(mapped);
  });

  it('home-station platform (homeToOffice) is not clickable', () => {
    const mapped = String(MAPPED_PLATFORMS[0]);
    const props = renderCard({
      isNext: true,
      direction: 'homeToOffice',
      tracker: tracker({ platform: mapped }),
    });
    fireEvent.click(screen.getByText(mapped));
    expect(props.onPlatformClick).not.toHaveBeenCalled();
  });

  it('formats multi-platform labels with a pipe', () => {
    renderCard({ isNext: true, tracker: tracker({ platform: '7 & 8' }) });
    expect(screen.getByText('7 | 8')).toBeTruthy();
  });
});

describe('On Board', () => {
  it('shows a delayed destination estimate and only 1–5 minute reminder choices', () => {
    const base: ArrivalReminder = {
      id: '', token: '7b0ab8c8-5bb0-4d88-a400-102030405060',
      deviceId: 'a7ed1351-d5c9-4e7d-a7b8-102030405060',
      serviceDate: '2026-07-06', lineId: 'ST', direction: 'homeToOffice',
      tripNumber: trip.tripId.split('-').at(-1)!, scheduledDeparture: trip.departure,
      homeStationCode: 'UI', destinationCode: 'UN', destinationName: 'Union Station',
      scheduledArrival: trip.arrival, scheduledArrivalAt: scheduledArrivalAt('2026-07-06', trip),
      delayMin: 10, leadMin: 2, enabled: true, lang: 'en', sent: false,
    };
    const reminder = { ...base, id: reminderId(base) };
    const onReminderLeadChange = vi.fn();
    const onReminderEnabledChange = vi.fn();
    renderCard({ isPast: true, nowMinutes: depMins + 5, isExpanded: true, isOnBoard: true,
      reminder, reminderDelivery: 'push', onReminderLeadChange, onReminderEnabledChange });
    const selector = screen.getByLabelText(en.remindBeforeArrival) as HTMLSelectElement;
    expect(Array.from(selector.options).map((option) => option.value)).toEqual(['1', '2', '3', '4', '5']);
    expect(screen.getByText(en.reminderAdjustedForDelay.replace('{min}', '10'))).toBeTruthy();
    fireEvent.change(selector, { target: { value: '5' } });
    expect(onReminderLeadChange).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onReminderEnabledChange).toHaveBeenCalledWith(false);
  });

  it('offers the On Board button only while the trip is running', () => {
    renderCard({ isPast: true, nowMinutes: depMins + 5, isExpanded: true });
    expect(screen.getByText(en.onBoard)).toBeTruthy();
    cleanup();

    renderCard({ nowMinutes: depMins - 60, isExpanded: true });
    expect(screen.queryByText(en.onBoard)).toBeNull();
  });

  it('toggling On Board fires the callback without collapsing the card', () => {
    const props = renderCard({ isPast: true, nowMinutes: depMins + 5, isExpanded: true });
    fireEvent.click(screen.getByText(en.onBoard));
    expect(props.onToggleOnBoard).toHaveBeenCalledOnce();
    expect(props.onToggleExpand).not.toHaveBeenCalled();
  });
});
