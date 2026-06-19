import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '7px',
          background: '#082b20',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 36 36" width="100%" height="100%">
          <defs>
            <linearGradient id="logoRim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8fff0" />
              <stop offset="0.3" stopColor="#7ED957" />
              <stop offset="0.55" stopColor="#0b3d2c" />
              <stop offset="0.8" stopColor="#7ED957" />
              <stop offset="1" stopColor="#e8fff0" />
            </linearGradient>
          </defs>
          <circle cx="18" cy="18" r="16.4" fill="none" stroke="url(#logoRim)" strokeWidth="1.6" />
          <circle cx="18" cy="18" r="14.4" fill="#00853F" />
          <g transform="translate(18,18) scale(0.8) translate(-18,-18)">
            <rect x="6" y="13" width="24" height="10" rx="2.5" fill="white" />
            <rect x="22" y="15" width="6" height="5" rx="1" fill="#0b3d2c" opacity="0.85" />
            <rect x="8" y="15" width="4" height="3.5" rx="0.8" fill="#0b3d2c" opacity="0.85" />
            <rect x="14" y="15" width="4" height="3.5" rx="0.8" fill="#0b3d2c" opacity="0.85" />
            <circle cx="11" cy="25" r="2.5" fill="white" />
            <circle cx="25" cy="25" r="2.5" fill="white" />
            <rect x="4" y="27" width="28" height="1.5" rx="0.75" fill="white" opacity="0.45" />
            <circle cx="29" cy="9" r="4" fill="#0b3d2c" />
            <circle cx="29" cy="9" r="2.5" fill="#4ade80" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
