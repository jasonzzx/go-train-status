// Shared auth for the /api/cron/* endpoints: an external scheduler calls them
// with the CRON_SECRET, either as a bearer header or a ?secret= param.

import type { NextRequest } from 'next/server';

export function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse until a secret is configured
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get('secret') === secret;
}

/** Current hour in America/Toronto (0-23). */
export function torontoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  );
}
