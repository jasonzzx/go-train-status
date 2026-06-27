// Browser-local memory of the platforms we've seen today.
//
// The live feed only publishes a Union departure's platform ~10–15 min ahead
// and drops it the instant the train leaves, so a card's platform would vanish
// the moment it flips NEXT → NOW (and is gone entirely after a reload). We have
// no server-side store, so instead we stash every platform we observe in
// localStorage, scoped to the current service day, and fall back to it. The
// number then stays put through departure and across reloads — for this
// browser. A browser that never saw the platform (e.g. opened after the train
// left) simply shows nothing, which is an acceptable limitation.

const STORAGE_KEY = 'go-train-platform-cache-v1';

interface StoredCache {
  /** Service day (YYYY-MM-DD) this map belongs to; a new day starts fresh. */
  date: string;
  /** "direction:departure" → platform, e.g. "officeToHome:17:39" → "7 & 8". */
  platforms: Record<string, string>;
}

function readStored(): StoredCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCache;
    if (typeof parsed?.date !== 'string' || typeof parsed?.platforms !== 'object' || parsed.platforms === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Platforms observed earlier today in this browser; empty on a new day. */
export function loadPlatformCache(today: string): Record<string, string> {
  const stored = readStored();
  if (!stored || stored.date !== today) return {};
  return stored.platforms;
}

/** Persist the platform map for `today`, replacing any earlier day's data. */
export function savePlatformCache(today: string, platforms: Record<string, string>): void {
  try {
    const payload: StoredCache = { date: today, platforms };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode or quota exceeded — caching is best-effort, so ignore.
  }
}
