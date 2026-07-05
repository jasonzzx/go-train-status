import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  secondsUntilDeparture,
  formatCountdown,
  countdownTone,
  formatMinutesAsHHMM,
} from './countdown';

describe('secondsUntilDeparture', () => {
  beforeEach(() => {
    // 09:00:30 America/Toronto (EDT, UTC-4)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-06T13:00:30.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down to the scheduled departure', () => {
    expect(secondsUntilDeparture('09:05', 0)).toBe(4 * 60 + 30);
  });

  it('adds the live delay to the target', () => {
    expect(secondsUntilDeparture('09:05', 10)).toBe(14 * 60 + 30);
  });

  it('clamps at zero once the departure has passed', () => {
    expect(secondsUntilDeparture('08:55', 0)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats minutes:seconds under an hour', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(605)).toBe('10:05');
  });

  it('adds an hours part at 1h+', () => {
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(3600 * 2 + 61)).toBe('2:01:01');
  });
});

describe('countdownTone', () => {
  it('calm above 10 minutes', () => {
    expect(countdownTone(601)).toBe('calm');
    expect(countdownTone(3600)).toBe('calm');
  });

  it('warn between 3 and 10 minutes inclusive', () => {
    expect(countdownTone(600)).toBe('warn');
    expect(countdownTone(180)).toBe('warn');
  });

  it('urgent under 3 minutes', () => {
    expect(countdownTone(179)).toBe('urgent');
    expect(countdownTone(0)).toBe('urgent');
  });
});

describe('formatMinutesAsHHMM', () => {
  it('formats minutes since midnight', () => {
    expect(formatMinutesAsHHMM(0)).toBe('00:00');
    expect(formatMinutesAsHHMM(9 * 60 + 5)).toBe('09:05');
    expect(formatMinutesAsHHMM(23 * 60 + 59)).toBe('23:59');
  });

  it('wraps past midnight and negative values', () => {
    expect(formatMinutesAsHHMM(1440)).toBe('00:00');
    expect(formatMinutesAsHHMM(1500)).toBe('01:00');
    expect(formatMinutesAsHHMM(-10)).toBe('23:50');
  });
});
