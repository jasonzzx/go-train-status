/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const noCache = { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' };
    return [
      // The HTML shell, manifest, and version probe must always be
      // revalidated — otherwise an installed PWA (especially iOS standalone
      // mode) can keep serving a stale build indefinitely.
      { source: '/', headers: [noCache] },
      { source: '/manifest.json', headers: [noCache] },
      { source: '/version.json', headers: [noCache] },
    ];
  },
};

export default nextConfig;
