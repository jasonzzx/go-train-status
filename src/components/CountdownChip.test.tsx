// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import CountdownChip from './CountdownChip';
import { LanguageProvider } from '@/i18n';
import en from '@/i18n/en.json';

// 09:00:00 America/Toronto (EDT, UTC-4)
const FROZEN_NOW = new Date('2026-07-06T13:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderChip(departure: string, delayMin = 0) {
  return render(
    <LanguageProvider>
      <CountdownChip departure={departure} delayMin={delayMin} />
    </LanguageProvider>
  );
}

describe('CountdownChip', () => {
  it('shows the remaining time and ticks down each second', () => {
    renderChip('09:30');
    expect(screen.getByText('30:00')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('29:59')).toBeTruthy();
  });

  it('includes hours for far-off departures and adds the live delay', () => {
    renderChip('10:30', 5);
    expect(screen.getByText('1:35:00')).toBeTruthy();
  });

  it('calm > 10 min: white-on-green chip styling', () => {
    renderChip('09:30');
    expect(screen.getByText('30:00').className).toContain('text-white');
  });

  it('warn ≤ 10 min: yellow chip styling', () => {
    renderChip('09:08');
    expect(screen.getByText('08:00').className).toContain('text-yellow-100');
  });

  it('urgent < 3 min: red chip styling, clamped at 00:00 after departure', () => {
    renderChip('09:02');
    expect(screen.getByText('02:00').className).toContain('text-red-50');

    act(() => vi.advanceTimersByTime(3 * 60_000));
    expect(screen.getByText('00:00')).toBeTruthy();
  });

  it('tapping the chip toggles the door-close note', () => {
    renderChip('09:30');
    expect(screen.queryByText(en.doorCloseInfo)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: en.boardingInfoLabel }));
    expect(screen.getByText(en.doorCloseInfo)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: en.boardingInfoLabel }));
    expect(screen.queryByText(en.doorCloseInfo)).toBeNull();
  });
});
