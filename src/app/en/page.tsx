'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_STORAGE_KEY } from '@/i18n';

// Bookmarkable shortcut: /en sets the saved language preference to
// English, then redirects to the app at "/".
export default function EnRedirect() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    router.replace('/');
  }, [router]);

  return null;
}
