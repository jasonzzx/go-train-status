import type { Metadata, Viewport } from 'next';
import { readFileSync } from 'fs';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';
import VersionWatcher from './VersionWatcher';
import { LanguageProvider } from '@/i18n';

function getBuildVersion(): string {
  try {
    const { version } = JSON.parse(readFileSync('public/version.json', 'utf-8'));
    return version;
  } catch {
    return 'dev';
  }
}

export const metadata: Metadata = {
  title: 'Go Train Status',
  description: 'Live GO Train status: Unionville GO ↔ Union Station',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Go Train Status',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#00853F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const buildVersion = getBuildVersion();
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body>
        <VersionWatcher buildVersion={buildVersion} />
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}
