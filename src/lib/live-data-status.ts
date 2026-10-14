export type TrackerRequestState = 'loading' | 'available' | 'unavailable';
export type LiveDataState = 'scheduleOnly' | 'loading' | 'fresh' | 'stale' | 'unavailable';

const STALE_AFTER_SECONDS = 90;

export interface LiveDataStatus {
  state: LiveDataState;
  ageSeconds: number | null;
}

export function getLiveDataStatus({
  isToday,
  requestState,
  lastUpdated,
  now,
}: {
  isToday: boolean;
  requestState: TrackerRequestState;
  lastUpdated: Date | null;
  now: Date;
}): LiveDataStatus {
  if (!isToday) return { state: 'scheduleOnly', ageSeconds: null };

  if (!lastUpdated) {
    return {
      state: requestState === 'loading' ? 'loading' : 'unavailable',
      ageSeconds: null,
    };
  }

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - lastUpdated.getTime()) / 1_000));
  const stale = requestState === 'unavailable' || ageSeconds > STALE_AFTER_SECONDS;
  return { state: stale ? 'stale' : 'fresh', ageSeconds };
}
