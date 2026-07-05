'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n';
import {
  secondsUntilDeparture,
  formatCountdown,
  countdownTone,
  type CountdownTone,
} from '@/lib/countdown';

// ── Departure countdown (NEXT card only) ────────────────────────────────────

// Chip colours per tone, tuned for the NEXT card's solid green background.
const COUNTDOWN_TONE_STYLES: Record<CountdownTone, { chip: string; label: string; value: string }> = {
  calm:   { chip: 'border-white/70 bg-white/10',      label: 'text-white/80',   value: 'text-white' },
  warn:   { chip: 'border-yellow-300 bg-yellow-300/15', label: 'text-yellow-200', value: 'text-yellow-100' },
  urgent: { chip: 'border-red-400 bg-red-500/25',     label: 'text-red-200',    value: 'text-red-50' },
};

// Live min:sec countdown to the expected departure — same chip shape as the
// platform badge. Self-contained 1s tick so only the chip re-renders; each
// tick recomputes from the wall clock, so a throttled background tab snaps
// back to the correct value on its first tick after resume. Tapping the chip
// itself opens the door-close note (no separate "i" button).
export default function CountdownChip({ departure, delayMin }: { departure: string; delayMin: number }) {
  const { t } = useLanguage();
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilDeparture(departure, delayMin));
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const tick = () => setSecondsLeft(secondsUntilDeparture(departure, delayMin));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [departure, delayMin]);

  const label = formatCountdown(secondsLeft);
  const tone = COUNTDOWN_TONE_STYLES[countdownTone(secondsLeft)];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={t('boardingInfoLabel')}
        onClick={(e) => { e.stopPropagation(); setInfoOpen((o) => !o); }}
        className={`flex flex-col items-center leading-none px-2 py-1 rounded-lg border-[3px] transition-colors ${tone.chip}`}
      >
        <span className={`text-[8px] font-bold uppercase tracking-wide ${tone.label}`}>
          {t('departsIn')}
        </span>
        <span className={`font-black leading-none mt-0.5 tabular-nums ${tone.value} ${label.length > 5 ? 'text-lg' : 'text-2xl'}`}>
          {label}
        </span>
      </button>
      {infoOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setInfoOpen(false); }} />
          <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-800 text-gray-100 text-[11px] rounded-lg px-3 py-2 shadow-lg z-50 leading-relaxed">
            {t('doorCloseInfo')}
            <div className="absolute -bottom-1 right-1.5 w-2 h-2 bg-gray-800 rotate-45" />
          </div>
        </>
      )}
    </div>
  );
}
