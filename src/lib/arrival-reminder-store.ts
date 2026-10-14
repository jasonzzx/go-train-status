import type { ArrivalReminder } from '@/lib/arrival-reminder';

export interface StoredArrivalReminder {
  reminder: ArrivalReminder;
  subscription: PushSubscriptionJSON;
}

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const INDEX = 'goarrival:index';
const TTL_SECONDS = 12 * 60 * 60;

export function reminderStoreEnabled(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const response = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Reminder store HTTP ${response.status}`);
  const data = await response.json() as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

function key(deviceId: string): string {
  return `goarrival:${deviceId}`;
}

export async function getReminder(deviceId: string): Promise<StoredArrivalReminder | null> {
  const raw = await redis(['GET', key(deviceId)]);
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as StoredArrivalReminder; } catch { return null; }
}

export async function saveReminder(value: StoredArrivalReminder): Promise<void> {
  const { reminder } = value;
  const expiresAt = reminder.scheduledArrivalAt + 6 * 60 * 60_000;
  await redis(['SET', key(reminder.deviceId), JSON.stringify(value), 'EX', TTL_SECONDS]);
  await redis(['ZADD', INDEX, expiresAt, reminder.deviceId]);
}

export async function deleteReminder(deviceId: string): Promise<void> {
  await redis(['DEL', key(deviceId)]);
  await redis(['ZREM', INDEX, deviceId]);
}

export async function cancelReminder(deviceId: string, id: string, token: string): Promise<void> {
  await redis(['SET', `goarrival:cancel:${deviceId}:${token}`, '1', 'EX', TTL_SECONDS]);
  const current = await getReminder(deviceId);
  if (current?.reminder.id === id && current.reminder.token === token) await deleteReminder(deviceId);
}

export async function wasCancelled(reminder: ArrivalReminder): Promise<boolean> {
  return (await redis(['GET', `goarrival:cancel:${reminder.deviceId}:${reminder.token}`])) === '1';
}

export async function activeReminders(now: number): Promise<StoredArrivalReminder[]> {
  await redis(['ZREMRANGEBYSCORE', INDEX, '-inf', now]);
  const ids = await redis(['ZRANGEBYSCORE', INDEX, now, '+inf', 'LIMIT', 0, 500]) as string[] | null;
  if (!Array.isArray(ids)) return [];
  const values = await Promise.all(ids.map((id) => getReminder(id)));
  return values.filter((value): value is StoredArrivalReminder => value !== null);
}

export async function claimReminder(reminder: ArrivalReminder): Promise<boolean> {
  const result = await redis(['SET', `goarrival:claim:${reminder.deviceId}:${reminder.id}`, '1', 'NX', 'EX', 90]);
  return result === 'OK';
}

export async function releaseReminder(reminder: ArrivalReminder): Promise<void> {
  await redis(['DEL', `goarrival:claim:${reminder.deviceId}:${reminder.id}`]);
}

export async function wasSent(reminder: ArrivalReminder): Promise<boolean> {
  return (await redis(['GET', `goarrival:sent:${reminder.deviceId}:${reminder.id}`])) === '1';
}

export async function markSent(reminder: ArrivalReminder): Promise<void> {
  await redis(['SET', `goarrival:sent:${reminder.deviceId}:${reminder.id}`, '1', 'EX', TTL_SECONDS]);
}
