'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import en from './en.json';
import zh from './zh.json';
import stationNamesZh from './station-names.zh.json';

export type Lang = 'en' | 'zh';

const DICTS: Record<Lang, Record<string, string>> = { en, zh };

const LANG_STORAGE_KEY = 'go-train-lang';

function loadLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  return stored === 'zh' ? 'zh' : 'en';
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    setLangState(loadLang());
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t: TranslateFn = useCallback((key, vars) => {
    const dict = DICTS[lang];
    let str = dict[key] ?? DICTS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

// Station code → Chinese name. Falls back to the English name when no
// translation exists yet (most lines besides Stouffville are first-pass).
export function getStationName(code: string, name: string, lang: Lang): string {
  if (lang !== 'zh') return name;
  return (stationNamesZh as Record<string, string>)[code] ?? name;
}
