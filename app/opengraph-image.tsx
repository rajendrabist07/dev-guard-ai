import { ImageResponse } from 'next/og';

export const alt = 'DevGuard AI autonomous pull request review preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0b0f19',
          color: '#f8fafc',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          padding: 72,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -80,
            width: 460,
            height: 460,
            borderRadius: 460,
            background: 'rgba(16, 185, 129, 0.22)',
            filter: 'blur(18px)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, width: '56%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 78,
                height: 78,
                borderRadius: 18,
                background: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#052e2b',
                fontSize: 46,
                fontWeight: 900,
              }}
            >
              DG
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 30, color: '#34d399', fontWeight: 800 }}>DevGuard AI</div>
              <div style={{ fontSize: 18, color: '#94a3b8' }}>Autonomous PR Review Agent</div>
            </div>
          </div>

          <div style={{ fontSize: 68, lineHeight: 1.04, fontWeight: 900, letterSpacing: 0 }}>
            Catch risky pull requests before they merge.
          </div>

          <div style={{ fontSize: 26, lineHeight: 1.35, color: '#cbd5e1' }}>
            Runs linters, dependency scans, and tests before producing structured security findings.
          </div>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            width: 430,
            height: 430,
            border: '1px solid rgba(148, 163, 184, 0.22)',
            background: 'rgba(15, 23, 42, 0.88)',
            borderRadius: 22,
            padding: 26,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 28px 90px rgba(0,0,0,0.42)',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>PR Review Findings</div>
          {[
            ['critical', 'SQL query uses string concatenation'],
            ['warning', 'axios@0.19.0 has known SSRF risk'],
            ['info', 'Run tests after payment handler change'],
          ].map(([severity, text]) => (
            <div
              key={severity}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                borderRadius: 14,
                background: 'rgba(2, 6, 23, 0.74)',
                border: '1px solid rgba(51, 65, 85, 0.9)',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: severity === 'critical' ? '#fb7185' : severity === 'warning' ? '#fbbf24' : '#38bdf8',
                  textTransform: 'uppercase',
                }}
              >
                {severity}
              </div>
              <div style={{ fontSize: 18, color: '#e2e8f0' }}>{text}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
