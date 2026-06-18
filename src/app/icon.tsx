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
            borderRadius: '7px',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 100%)',
            border: '1px solid rgba(255,255,255,0.14)',
            display: 'flex',
          }}
        />
        {/* Mint dot top-right */}
        <div
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#34D399',
            display: 'flex',
          }}
        />
        {/* GO text */}
        <span
          style={{
            fontSize: '15px',
            fontWeight: 900,
            color: '#7fe7ff',
            letterSpacing: '-1px',
            lineHeight: 1,
            position: 'relative',
          }}
        >
          GO
        </span>
      </div>
    ),
    { ...size },
  );
}
