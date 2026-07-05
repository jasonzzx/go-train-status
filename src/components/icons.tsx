'use client';

// ── Shared SVG icons ─────────────────────────────────────────────────────────
// Pure presentational icons used across the app. The service-status trio
// (Good/Minor/NoService) matches gotransit.com's service-updates styling.

import type { LineStatus } from '@/lib/line-status';

export function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// Status badges matching gotransit.com's service-updates page styling.
export function GoodServiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#22a454" />
      <path d="M6.2 10.3l2.4 2.3 5.2-5.4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinorDelaysIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#f5821f" />
      <rect x="9.1" y="5" width="1.8" height="6.2" rx="0.9" fill="white" />
      <circle cx="10" cy="14" r="1.05" fill="white" />
    </svg>
  );
}

export function NoServiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#eab308" />
      <path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LineStatusIcon({ status, className }: { status: LineStatus; className?: string }) {
  if (status === 'noService') return <NoServiceIcon className={className} />;
  if (status === 'minor') return <MinorDelaysIcon className={className} />;
  return <GoodServiceIcon className={className} />;
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
    </svg>
  );
}

// ── Vehicle type icons (GO Transit style) ────────────────────────────────────

export function TrainIcon({ className, inverted }: { className?: string; inverted?: boolean }) {
  // "inverted" matches the app logo's white train body with dark green windows,
  // used when the icon itself renders in white (e.g. on a solid green card).
  const windowFill = inverted ? '#0b3d2c' : 'white';
  const windowOpacity = inverted ? 0.85 : 0.9;
  return (
    <svg viewBox="0 0 28 24" fill="currentColor" className={className} aria-hidden="true">
      {/* body -->*/}
      <rect x="2" y="4" width="24" height="14" rx="3" />
      {/* cab window -->*/}
      <rect x="17" y="6.5" width="6" height="5" rx="1" fill={windowFill} opacity={windowOpacity} />
      {/* side windows -->*/}
      <rect x="4" y="6.5" width="4" height="5" rx="1" fill={windowFill} opacity={windowOpacity} />
      <rect x="10" y="6.5" width="4" height="5" rx="1" fill={windowFill} opacity={windowOpacity} />
      {/* stripe -->*/}
      <rect x="2" y="13" width="24" height="2" fill={inverted ? '#0b3d2c' : 'white'} opacity={inverted ? 0.35 : 0.25} />
      {/* wheels -->*/}
      <circle cx="8" cy="20" r="2.5" />
      <circle cx="20" cy="20" r="2.5" />
      {/* rail -->*/}
      <rect x="0" y="22" width="28" height="1.5" rx="0.75" opacity="0.4" />
    </svg>
  );
}

export function BusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 24" fill="currentColor" className={className} aria-hidden="true">
      {/* body -->*/}
      <rect x="2" y="2" width="24" height="17" rx="3" />
      {/* windshield -->*/}
      <rect x="4" y="4" width="20" height="6" rx="1.5" fill="white" opacity="0.9" />
      {/* side windows -->*/}
      <rect x="4" y="12" width="5" height="4" rx="1" fill="white" opacity="0.9" />
      <rect x="11.5" y="12" width="5" height="4" rx="1" fill="white" opacity="0.9" />
      <rect x="19" y="12" width="5" height="4" rx="1" fill="white" opacity="0.9" />
      {/* wheels -->*/}
      <circle cx="8" cy="21" r="2.5" />
      <circle cx="20" cy="21" r="2.5" />
      {/* undercarriage -->*/}
      <rect x="2" y="18" width="24" height="1.5" opacity="0.3" />
    </svg>
  );
}
