// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LineBadge, StationBadge } from './badges';
import { getLine, getStation } from '@/lib/lines';

afterEach(cleanup);

describe('LineBadge', () => {
  it('shows the line code on the line brand colour', () => {
    const line = getLine('ST');
    render(<LineBadge line={line} />);
    const badge = screen.getByText('ST');
    expect(badge.style.backgroundColor).not.toBe('');
  });

  it('sizes down for the sm variant', () => {
    const line = getLine('LW');
    render(<LineBadge line={line} size="sm" />);
    expect(screen.getByText('LW').className).toContain('w-7');
  });
});

describe('StationBadge', () => {
  it('shows the station code on the given colour', () => {
    const line = getLine('ST');
    const station = getStation('ST', line.defaultHomeCode);
    render(<StationBadge station={station} color="#425563" />);
    const badge = screen.getByText(station.code);
    expect(badge.style.backgroundColor).toBe('rgb(66, 85, 99)');
  });
});
