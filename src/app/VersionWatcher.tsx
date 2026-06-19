'use client';

import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 60_000;

export default function VersionWatcher({ buildVersion }: { buildVersion: string }) {
  const reloadingRef = useRef(false);

  useEffect(() => {
    const checkVersion = async () => {
      if (reloadingRef.current) return;
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== buildVersion) {
          reloadingRef.current = true;
          window.location.reload();
        }
      } catch {
        // network hiccup — ignore, we'll check again next interval
      }
    };

    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkVersion);
    };
  }, [buildVersion]);

  return null;
}
