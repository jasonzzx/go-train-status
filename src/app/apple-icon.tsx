import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '40px',
          background: 'linear-gradient(135deg, #1c3a5e 0%, #0b1c2e 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Frosted glass overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '40px',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 100%)',
            border: '2px solid rgba(255,255,255,0.14)',
            display: 'flex',
          }}
        />
        {/* Mint dot top-right */}
        <div
          style={{
            position: 'absolute',
            top: '22px',
            right: '22px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#34D399',
            display: 'flex',
          }}
        />
        {/* GO text */}
        <span
          style={{
            fontSize: '90px',
            fontWeight: 900,
            color: '#7fe7ff',
            letterSpacing: '-5px',
            lineHeight: 1,
            position: 'relative',
            textShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          GO
        </span>
      </div>
    ),
    { ...size },
  );
}
