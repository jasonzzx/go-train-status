// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import LinePicker from './LinePicker';
import StationPicker from './StationPicker';
import { LINES, getLine } from '@/lib/lines';
import en from '@/i18n/en.json';

afterEach(cleanup);

// Both pickers receive lang/t as props (no provider needed); mirror the
// page's t() for the strings under test.
const t = (key: string, vars?: Record<string, string | number>) => {
  let str = (en as Record<string, string>)[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) str = str.replaceAll(`{${k}}`, String(v));
  return str;
};

describe('LinePicker', () => {
  it('opens the dropdown listing every line and reports a selection', () => {
    const onChange = vi.fn();
    render(<LinePicker line={getLine('ST')} lang="en" t={t} onChange={onChange} />);

    // Closed: only the current line's badge shows.
    expect(screen.getAllByText('ST')).toHaveLength(1);

    fireEvent.click(screen.getByText(t('lineOption', { name: getLine('ST').name })));
    // Open: one badge per line, plus the current line twice (button + option).
    expect(screen.getAllByText('LW').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ST')).toHaveLength(2);

    fireEvent.click(screen.getByText(t('lineOption', { name: getLine('LW').name })));
    expect(onChange).toHaveBeenCalledWith('LW');
    // Dropdown closes after selecting.
    expect(screen.getAllByText('ST')).toHaveLength(1);
  });

  it('closes when clicking outside', () => {
    render(<LinePicker line={getLine('ST')} lang="en" t={t} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(t('lineOption', { name: getLine('ST').name })));
    expect(screen.getAllByText('ST')).toHaveLength(2);

    fireEvent.mouseDown(document.body);
    expect(screen.getAllByText('ST')).toHaveLength(1);
  });

  it('lists all lines when open', () => {
    render(<LinePicker line={getLine('ST')} lang="en" t={t} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(t('lineOption', { name: getLine('ST').name })));
    for (const l of LINES) {
      expect(screen.getAllByText(l.id).length).toBeGreaterThan(0);
    }
  });
});

describe('StationPicker', () => {
  const line = getLine('ST');

  it('shows the current station and reports a new selection', () => {
    const onChange = vi.fn();
    render(
      <StationPicker line={line} stationCode={line.defaultHomeCode} lang="en" onChange={onChange} />
    );

    fireEvent.click(screen.getAllByText(line.defaultHomeCode)[0]);
    // Open: every home station on the line is listed by code badge.
    for (const s of line.homeStations) {
      expect(screen.getAllByText(s.code).length).toBeGreaterThan(0);
    }

    const other = line.homeStations.find((s) => s.code !== line.defaultHomeCode)!;
    fireEvent.click(screen.getAllByText(other.code)[0]);
    expect(onChange).toHaveBeenCalledWith(other.code);
  });
});
