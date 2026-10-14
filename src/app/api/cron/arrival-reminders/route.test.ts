import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { serviceTimeAt, reminderId, type ArrivalReminder } from '@/lib/arrival-reminder';

const store = vi.hoisted(() => ({
  activeReminders: vi.fn(), claimReminder: vi.fn(), deleteReminder: vi.fn(),
  getReminder: vi.fn(), markSent: vi.fn(), releaseReminder: vi.fn(),
  reminderStoreEnabled: vi.fn(() => true), saveReminder: vi.fn(),
  wasCancelled: vi.fn(() => false), wasSent: vi.fn(() => false),
}));
const push = vi.hoisted(() => ({ pushEnabled: vi.fn(() => true), sendArrivalPush: vi.fn() }));
const metrolinx = vi.hoisted(() => ({ metrolinxEnabled: vi.fn(() => true), getLiveStatusByTripNumber: vi.fn() }));

vi.mock('@/lib/arrival-reminder-store', () => store);
vi.mock('@/lib/arrival-push', () => push);
vi.mock('@/lib/metrolinx/client', () => ({ metrolinxEnabled: metrolinx.metrolinxEnabled }));
vi.mock('@/lib/metrolinx/trains', () => ({ getLiveStatusByTripNumber: metrolinx.getLiveStatusByTripNumber }));

import { GET } from './route';

function setup() {
  const reminder: ArrivalReminder = {
    id: '', token: '7b0ab8c8-5bb0-4d88-a400-102030405060',
    deviceId: 'a7ed1351-d5c9-4e7d-a7b8-102030405060',
    serviceDate: '2026-10-04', lineId: 'ST', direction: 'officeToHome',
    tripNumber: '7422', scheduledDeparture: '17:20', homeStationCode: 'UI',
    destinationCode: 'UI', destinationName: 'Unionville GO', scheduledArrival: '18:00',
    scheduledArrivalAt: serviceTimeAt('2026-10-04', '18:00'),
    delayMin: 0, leadMin: 2, enabled: true, lang: 'en', sent: false,
  };
  reminder.id = reminderId(reminder);
  const value = { reminder, subscription: { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'key', auth: 'key' } } };
  store.activeReminders.mockResolvedValue([value]);
  store.getReminder.mockResolvedValue(value);
  store.claimReminder.mockResolvedValue(true);
  metrolinx.getLiveStatusByTripNumber.mockResolvedValue(new Map([['7422', {
    delayMin: 10, cancelled: false, hasLive: true,
  }]]));
  return value;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  store.reminderStoreEnabled.mockReturnValue(true);
  push.pushEnabled.mockReturnValue(true);
  metrolinx.metrolinxEnabled.mockReturnValue(true);
  store.wasCancelled.mockResolvedValue(false);
  store.wasSent.mockResolvedValue(false);
  store.saveReminder.mockResolvedValue(undefined);
  store.markSent.mockResolvedValue(undefined);
  store.releaseReminder.mockResolvedValue(undefined);
  push.sendArrivalPush.mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => { vi.useRealTimers(); delete process.env.CRON_SECRET; });

describe('arrival reminder cron', () => {
  const request = () => new Request('https://example.test/api/cron/arrival-reminders', {
    headers: { authorization: 'Bearer test-secret' },
  });

  it('moves the reminder to two minutes before the delayed arrival', async () => {
    const value = setup();
    vi.setSystemTime(serviceTimeAt('2026-10-04', '18:02'));
    expect((await GET(request())).status).toBe(200);
    expect(push.sendArrivalPush).not.toHaveBeenCalled();
    expect(value.reminder.delayMin).toBe(10);

    vi.setSystemTime(serviceTimeAt('2026-10-04', '18:08'));
    const response = await GET(request());
    expect((await response.json()).sent).toBe(1);
    expect(push.sendArrivalPush).toHaveBeenCalledOnce();
    expect(store.markSent).toHaveBeenCalledOnce();
  });

  it('requires the cron secret', async () => {
    const response = await GET(new Request('https://example.test/api/cron/arrival-reminders'));
    expect(response.status).toBe(401);
    expect(store.activeReminders).not.toHaveBeenCalled();
  });
});
