'use client';

import { useState, useEffect, useRef } from 'react';
import { LINES, type LineInfo } from '@/lib/lines';
import { lineDisplayName, useLanguage, type Lang } from '@/i18n';
import { LineBadge } from '@/components/badges';

// Custom line picker — a native <select> can't show a colour swatch per
// option, so this is a button + dropdown panel instead.
export default function LinePicker({
  line,
  lang,
  t,
  onChange,
}: {
  line: LineInfo;
  lang: Lang;
  t: ReturnType<typeof useLanguage>['t'];
  onChange: (lineId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="relative flex-1" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-white/10 text-white text-sm rounded-lg pl-1.5 pr-7 py-1.5 border border-white/20 focus:outline-none focus:border-white/50"
      >
        <LineBadge line={line} size="sm" />
        <span className="truncate">{t('lineOption', { name: lineDisplayName(line, lang) })}</span>
      </button>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>

      {open && (
        <div
          className="absolute z-20 left-0 right-0 mt-1 bg-go-dark border border-white/20 rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto"
        >
          {LINES.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => { onChange(l.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-white hover:bg-white/10 ${l.id === line.id ? 'bg-white/10' : ''}`}
            >
              <LineBadge line={l} size="sm" />
              <span className="truncate">{t('lineOption', { name: lineDisplayName(l, lang) })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
