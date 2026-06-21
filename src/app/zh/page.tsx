'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_STORAGE_KEY } from '@/i18n';

// Bookmarkable shortcut: /zh sets the saved language preference to
// Simplified Chinese, then redirects to the app at "/".
export default function ZhRedirect() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, 'zh');
    router.replace('/');
  }, [router]);

  return null;
}
