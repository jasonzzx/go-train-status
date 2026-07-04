import { describe, it, expect } from 'vitest';
import { torontoDateStr } from './platform-store';

describe('torontoDateStr', () => {
  it('formats as YYYY-MM-DD in America/Toronto', () => {
    // 15:00 UTC = 11:00 EDT — same calendar day.
    expect(torontoDateStr(new Date('2026-07-03T15:00:00Z'))).toBe('2026-07-03');
  });

  it('rolls back to the previous day before the Toronto midnight', () => {
    // 03:30 UTC on Jul 4 = 23:30 EDT on Jul 3.
    expect(torontoDateStr(new Date('2026-07-04T03:30:00Z'))).toBe('2026-07-03');
  });

  it('handles winter (EST, UTC-5)', () => {
    // 04:30 UTC on Jan 2 = 23:30 EST on Jan 1.
    expect(torontoDateStr(new Date('2026-01-02T04:30:00Z'))).toBe('2026-01-01');
  });
});
