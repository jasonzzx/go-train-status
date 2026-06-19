#!/usr/bin/env node
/**
 * Renders the train logo (metallic bevel rim) to all static PNG icon sizes
 * referenced by manifest.json and the apple-touch-icon link tag.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { ImageResponse } from 'next/og.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const SIZES = [20, 29, 32, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 192, 512, 1024];

function h(type, props, ...children) {
  return { type, props: { ...props, children: children.flat() } };
}

function logoSvg() {
  return h(
    'svg',
    { viewBox: '0 0 36 36', width: '100%', height: '100%' },
    h(
      'defs',
      {},
      h(
        'linearGradient',
        { id: 'logoRim', x1: '0', y1: '0', x2: '1', y2: '1' },
        h('stop', { offset: '0', stopColor: '#e8fff0' }),
        h('stop', { offset: '0.3', stopColor: '#7ED957' }),
        h('stop', { offset: '0.55', stopColor: '#0b3d2c' }),
        h('stop', { offset: '0.8', stopColor: '#7ED957' }),
        h('stop', { offset: '1', stopColor: '#e8fff0' }),
      ),
    ),
    h('circle', { cx: 18, cy: 18, r: 16.4, fill: 'none', stroke: 'url(#logoRim)', strokeWidth: 1.6 }),
    h('circle', { cx: 18, cy: 18, r: 14.4, fill: '#00853F' }),
    h(
      'g',
      { transform: 'translate(18,18) scale(0.8) translate(-18,-18)' },
      h('rect', { x: 6, y: 13, width: 24, height: 10, rx: 2.5, fill: 'white' }),
      h('rect', { x: 22, y: 15, width: 6, height: 5, rx: 1, fill: '#0b3d2c', opacity: 0.85 }),
      h('rect', { x: 8, y: 15, width: 4, height: 3.5, rx: 0.8, fill: '#0b3d2c', opacity: 0.85 }),
      h('rect', { x: 14, y: 15, width: 4, height: 3.5, rx: 0.8, fill: '#0b3d2c', opacity: 0.85 }),
      h('circle', { cx: 11, cy: 25, r: 2.5, fill: 'white' }),
      h('circle', { cx: 25, cy: 25, r: 2.5, fill: 'white' }),
      h('rect', { x: 4, y: 27, width: 28, height: 1.5, rx: 0.75, fill: 'white', opacity: 0.45 }),
      h('circle', { cx: 29, cy: 9, r: 4, fill: '#0b3d2c' }),
      h('circle', { cx: 29, cy: 9, r: 2.5, fill: '#4ade80' }),
    ),
  );
}

async function renderIcon(sizePx) {
  const radius = Math.round(sizePx * 0.22);
  const root = h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        borderRadius: `${radius}px`,
        background: '#082b20',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    logoSvg(),
  );
  const res = new ImageResponse(root, { width: sizePx, height: sizePx });
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(join(PUBLIC_DIR, 'icons'), { recursive: true });

for (const s of SIZES) {
  const buf = await renderIcon(s);
  await writeFile(join(PUBLIC_DIR, 'icons', `icon-${s}x${s}.png`), buf);
  console.log(`icons/icon-${s}x${s}.png`);
}

// apple-icon.png (referenced directly by layout.tsx <link rel="apple-touch-icon">)
const appleBuf = await renderIcon(180);
await writeFile(join(PUBLIC_DIR, 'apple-icon.png'), appleBuf);
console.log('apple-icon.png');

console.log('\nDone.');
