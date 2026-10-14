// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/i18n';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';
import Home from './page';

// Full-page smoke test: the regression net for decomposing page.tsx.
// Renders the real Home page against the bundled static schedule with the
// live APIs mocked as unavailable, so every extraction step can be checked
// against the same rendered output.

// Freeze the Toronto clock at a weekday morning (Mon 2026-07-06 09:00 EDT)
// so the same weekday schedule renders no matter when the test runs. Only
// Date is faked — intervals/timeouts stay real so React effects behave.
const FROZEN_NOW = new Date('2026-07-06T13:00:00.000Z');

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function mockApis(tracker: unknown = { trips: [], available: false, lastUpdated: null }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/tracker')) return jsonResponse(tracker);
      if (url.startsWith('/api/alerts')) return jsonResponse({ alerts: [], available: false });
      if (url.startsWith('/api/schedule')) return jsonResponse({ available: false });
      return jsonResponse({});
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  vi.stubGlobal('scrollTo', vi.fn());
  mockApis();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

async function renderHome() {
  render(
    <LanguageProvider>
      <Home />
    </LanguageProvider>
  );
  // Waiting for the tracker result lets mocked fetch updates settle in act().
  await screen.findAllByText(en.liveDataUnavailable);
}

describe('Home page (static weekday schedule, live APIs unavailable)', () => {
  it('renders the header: title, line/home pickers, route bar to Union', async () => {
    await renderHome();
    expect(screen.getByText(en.appTitle)).toBeTruthy();
    expect(screen.getByText(en.lineLabel)).toBeTruthy();
    expect(screen.getByText(en.homeLabel)).toBeTruthy();
    // Morning default direction is home → office, so Union is the arrival
    // side of the route bar.
    expect(screen.getAllByText(en.unionStation).length).toBeGreaterThan(0);
  });

  it('renders the weekday trip list with exactly one NEXT card', async () => {
    await renderHome();
    // One "depart" label per train card; a weekday has many departures.
    expect(screen.getAllByText(en.depart).length).toBeGreaterThanOrEqual(3);
    // 09:00 on a weekday: there is a later departure, and only one card
    // carries the NEXT badge (with its live countdown).
    expect(screen.getAllByText(en.nextBadge)).toHaveLength(1);
    expect(screen.getByText(en.departsIn)).toBeTruthy();
  });

  it('makes an unavailable live feed explicit beside the trip list', async () => {
    await renderHome();
    expect(screen.getByTestId('live-data-status').textContent).toBe(en.liveDataUnavailable);
  });

  it('shows the age of fresh live data', async () => {
    mockApis({
      trips: [],
      available: true,
      source: 'metrolinx',
      lastUpdated: new Date(FROZEN_NOW.getTime() - 20_000).toISOString(),
    });
    render(
      <LanguageProvider>
        <Home />
      </LanguageProvider>
    );
    const expected = en.liveUpdatedSeconds.replace('{seconds}', '20');
    await screen.findAllByText(expected);
    expect(screen.getByTestId('live-data-status').textContent).toBe(expected);
  });

  it('labels future dates as scheduled times only', async () => {
    await renderHome();
    fireEvent.click(screen.getByText(en.tomorrow));
    expect(screen.getByTestId('live-data-status').textContent).toBe(en.scheduledOnly);
  });

  it('switches direction to Union → home via the direction tab', async () => {
    await renderHome();
    fireEvent.click(screen.getByText(en.unionToHome.replace('{home}', 'Unionville')));
    // Route bar now departs from Union; trips still render.
    expect(screen.getAllByText(en.depart).length).toBeGreaterThanOrEqual(3);
  });

  it('toggles the UI language to Chinese and back', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('中文'));
    expect(await screen.findByText(zh.appTitle)).toBeTruthy();
    expect(screen.getAllByText(zh.depart).length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByText('EN'));
    expect(await screen.findByText(en.appTitle)).toBeTruthy();
  });

  it('expands a train card to show its station stop list', async () => {
    await renderHome();
    const departLabels = screen.getAllByText(en.depart);
    // Click the first card's header row (the button wrapping the depart label).
    const headerButton = departLabels[0].closest('button')!;
    fireEvent.click(headerButton);
    // The expanded list ends at Union Station on the home → office direction,
    // so Union now appears in the stop list as well as the route bar.
    expect(screen.getAllByText(en.unionStation).length).toBeGreaterThan(1);
  });
});
