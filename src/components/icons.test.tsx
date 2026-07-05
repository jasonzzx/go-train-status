// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  BellIcon,
  CheckCircleIcon,
  GoodServiceIcon,
  MinorDelaysIcon,
  NoServiceIcon,
  LineStatusIcon,
  ArrowRightIcon,
  TrainIcon,
  BusIcon,
} from './icons';

afterEach(cleanup);

describe('icons', () => {
  it('renders each plain icon as an svg with the given className', () => {
    for (const Icon of [BellIcon, CheckCircleIcon, GoodServiceIcon, MinorDelaysIcon, NoServiceIcon, ArrowRightIcon, BusIcon]) {
      const { container, unmount } = render(<Icon className="w-5 h-5" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('class')).toBe('w-5 h-5');
      unmount();
    }
  });

  it('LineStatusIcon picks the icon for each status', () => {
    // Each status icon is identified by its distinctive circle fill.
    const fills: Record<string, string> = { good: '#22a454', minor: '#f5821f', noService: '#eab308' };
    for (const [status, fill] of Object.entries(fills)) {
      const { container, unmount } = render(<LineStatusIcon status={status as 'good' | 'minor' | 'noService'} />);
      expect(container.querySelector(`circle[fill="${fill}"]`)).not.toBeNull();
      unmount();
    }
  });

  it('TrainIcon swaps window fill when inverted (for the solid green NEXT card)', () => {
    const normal = render(<TrainIcon />);
    expect(normal.container.querySelector('rect[fill="white"]')).not.toBeNull();
    normal.unmount();

    const inverted = render(<TrainIcon inverted />);
    expect(inverted.container.querySelector('rect[fill="#0b3d2c"]')).not.toBeNull();
    inverted.unmount();
  });
});
