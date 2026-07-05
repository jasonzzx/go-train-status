// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ServiceAlertsSheet from './ServiceAlertsSheet';
import { LanguageProvider } from '@/i18n';
import { getLine } from '@/lib/lines';
import type { ParsedAlert } from '@/app/api/alerts/route';
import en from '@/i18n/en.json';

afterEach(cleanup);

type Props = Parameters<typeof ServiceAlertsSheet>[0];

function renderSheet(overrides: Partial<Props> = {}) {
  const props: Props = {
    line: getLine('ST'),
    alerts: [],
    loading: false,
    available: true,
    lastUpdated: null,
    status: 'good',
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <ServiceAlertsSheet {...props} />
    </LanguageProvider>
  );
  return props;
}

describe('ServiceAlertsSheet states', () => {
  it('loading spinner', () => {
    renderSheet({ loading: true });
    expect(screen.getByText(en.loadingServiceUpdates)).toBeTruthy();
  });

  it('live data unavailable', () => {
    renderSheet({ available: false });
    expect(screen.getByText(en.liveDataUnavailable)).toBeTruthy();
  });

  it('good service when no alerts', () => {
    renderSheet({ status: 'good' });
    expect(screen.getByText(en.goodService)).toBeTruthy();
  });

  it('minor delays block', () => {
    renderSheet({ status: 'minor' });
    expect(screen.getByText(en.minorDelays)).toBeTruthy();
  });

  it('no scheduled service block', () => {
    renderSheet({ status: 'noService' });
    expect(screen.getByText(en.noScheduledServiceToday)).toBeTruthy();
  });

  it('renders alert cards with route, schedule, status, and reason', () => {
    const alert = {
      title: 'Delay: UP Express',
      fromStation: 'Union Station',
      toStation: 'Unionville GO',
      direction: 'northbound',
      scheduledDeparture: '17:10',
      scheduledArrival: '17:53',
      status: 'Moving',
      reason: 'Signal issues',
    } as ParsedAlert;
    renderSheet({ status: 'minor', alerts: [alert] });
    expect(screen.getByText(alert.title)).toBeTruthy();
    expect(screen.getByText('↑ NB')).toBeTruthy();
    expect(screen.getByText('17:10')).toBeTruthy();
    expect(screen.getByText('Moving')).toBeTruthy();
    expect(screen.getByText('Signal issues')).toBeTruthy();
  });

  it('footer links to the line service-updates page and shows last-updated', () => {
    renderSheet({ lastUpdated: '2026-07-06T13:00:00.000Z' });
    const link = screen.getByText(en.viewOnGotransit).closest('a')!;
    expect(link.href).toContain('code=ST');
    expect(screen.getByText(/09:00/).textContent).toContain('09:00'); // Toronto time
  });

  it('closes on the ✕ button and on backdrop click, not on sheet click', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByText(en.goodService));
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('✕'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
