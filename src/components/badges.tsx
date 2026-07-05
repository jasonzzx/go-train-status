'use client';

// ── Line / station code badges ───────────────────────────────────────────────
// The 2-letter code chips used by the pickers; both take the line's official
// GO Transit brand colour so every station under a line reads as belonging
// to it.

import type { LineInfo, StationInfo } from '@/lib/lines';

// Line-colour badge — the 2-letter line code (e.g. "ST") on its official
// GO Transit brand colour. Always shown in English/as-is; not translated.
export function LineBadge({ line, size = 'md' }: { line: LineInfo; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'w-7 h-5 text-[10px]' : 'w-9 h-6 text-xs';
  return (
    <span
      className={`${dims} rounded-md flex items-center justify-center font-extrabold text-white shrink-0 tracking-wide`}
      style={{ backgroundColor: line.color }}
    >
      {line.id}
    </span>
  );
}

// Station-code badge — same shape as LineBadge, coloured with the parent
// line's colour.
export function StationBadge({ station, color, size = 'md' }: { station: StationInfo; color: string; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'w-7 h-5 text-[10px]' : 'w-9 h-6 text-xs';
  return (
    <span
      className={`${dims} rounded-md flex items-center justify-center font-extrabold text-white shrink-0 tracking-wide`}
      style={{ backgroundColor: color }}
    >
      {station.code}
    </span>
  );
}
