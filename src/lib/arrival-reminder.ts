import { timeToMinutes, type Direction, type Trip } from '@/lib/schedule-data';

export const REMINDER_STORAGE_KEY = 'go-train-arrival-reminder';
export const REMINDER_LEAD_KEY = 'go-train-arrival-lead';

export interface ArrivalReminder {
  id: string;
  token: string;
  deviceId: string;
  serviceDate: string;
  lineId: string;
  direction: Direction;
  tripNumber: string;
  scheduledDeparture: string;
  homeStationCode: string;
  destinationCode: string;
  destinationName: string;
  scheduledArrival: string;
  scheduledArrivalAt: number;
  delayMin: number;
  leadMin: number;
  enabled: boolean;
  lang: 'en' | 'zh';
  sent: boolean;
}

const TORONTO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function torontoWallTime(epoch: number): string {
  const parts = TORONTO.formatToParts(new Date(epoch));
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

/** Resolve a GO service-day time (including 24:xx) to a real Toronto instant. */
export function serviceTimeAt(serviceDate: string, time: string, after = -Infinity): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !/^\d{1,2}:\d{2}$/.test(time)) {
    throw new Error('Invalid service date or time');
  }
  const [year, month, day] = serviceDate.split('-').map(Number);
  const minutes = timeToMinutes(time);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 48 * 60 || Number(time.split(':')[1]) >= 60) {
    throw new Error('Invalid service time');
  }
  const wall = new Date(Date.UTC(year, month - 1, day, 0, minutes));
  const label = `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, '0')}-${String(wall.getUTCDate()).padStart(2, '0')} ${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
  const base = wall.getTime();
  const candidates = [base + 4 * 3_600_000, base + 5 * 3_600_000]
    .filter((epoch) => torontoWallTime(epoch) === label).sort((a, b) => a - b);
  // During the spring clock jump, a nonexistent 02:xx maps to 03:xx.
  const valid = candidates.length ? candidates : [base + 5 * 3_600_000];
  return valid.find((epoch) => epoch >= after) ?? valid[valid.length - 1];
}

export function scheduledArrivalAt(serviceDate: string, trip: Pick<Trip, 'departure' | 'arrival'>): number {
  const departure = serviceTimeAt(serviceDate, trip.departure);
  const arrivalMinutes = timeToMinutes(trip.arrival);
  const departureMinutes = timeToMinutes(trip.departure);
  const arrival = arrivalMinutes < departureMinutes
    ? `${String(Math.floor((arrivalMinutes + 1440) / 60))}:${String((arrivalMinutes + 1440) % 60).padStart(2, '0')}`
    : trip.arrival;
  return serviceTimeAt(serviceDate, arrival, departure);
}

export function tripNumber(tripId: string): string {
  return tripId.split('-').at(-1) ?? '';
}

export function reminderId(input: Pick<ArrivalReminder, 'serviceDate' | 'lineId' | 'direction' | 'tripNumber' | 'homeStationCode' | 'destinationCode'>): string {
  return [input.serviceDate, input.lineId, input.direction, input.tripNumber, input.homeStationCode, input.destinationCode].join(':');
}

export function expectedArrivalAt(reminder: Pick<ArrivalReminder, 'scheduledArrivalAt' | 'delayMin'>): number {
  return reminder.scheduledArrivalAt + reminder.delayMin * 60_000;
}

export function reminderDue(reminder: Pick<ArrivalReminder, 'scheduledArrivalAt' | 'delayMin' | 'leadMin' | 'enabled' | 'sent'>, now: number): boolean {
  const arrival = expectedArrivalAt(reminder);
  return reminder.enabled && !reminder.sent && now < arrival && now >= arrival - reminder.leadMin * 60_000;
}

export function validLead(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 2;
}

export function validReminder(value: unknown): value is ArrivalReminder {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && r.id.length < 100
    && typeof r.token === 'string' && /^[a-f0-9-]{36}$/.test(r.token)
    && typeof r.deviceId === 'string' && /^[a-f0-9-]{36}$/.test(r.deviceId)
    && typeof r.serviceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.serviceDate)
    && typeof r.lineId === 'string' && /^[A-Z]{2}$/.test(r.lineId)
    && (r.direction === 'homeToOffice' || r.direction === 'officeToHome')
    && typeof r.tripNumber === 'string' && /^[a-zA-Z0-9]{1,20}$/.test(r.tripNumber)
    && typeof r.scheduledDeparture === 'string' && /^\d{1,2}:\d{2}$/.test(r.scheduledDeparture)
    && typeof r.homeStationCode === 'string' && /^[A-Z0-9]{2,5}$/.test(r.homeStationCode)
    && typeof r.destinationCode === 'string' && /^[A-Z0-9]{2,5}$/.test(r.destinationCode)
    && typeof r.destinationName === 'string' && r.destinationName.length <= 100
    && typeof r.scheduledArrival === 'string' && /^\d{1,2}:\d{2}$/.test(r.scheduledArrival)
    && typeof r.scheduledArrivalAt === 'number' && Number.isFinite(r.scheduledArrivalAt)
    && typeof r.delayMin === 'number' && Number.isInteger(r.delayMin) && r.delayMin >= 0 && r.delayMin <= 240
    && typeof r.leadMin === 'number' && Number.isInteger(r.leadMin) && r.leadMin >= 1 && r.leadMin <= 5
    && typeof r.enabled === 'boolean' && (r.lang === 'en' || r.lang === 'zh') && typeof r.sent === 'boolean'
    && r.id === reminderId(r as unknown as ArrivalReminder);
}
