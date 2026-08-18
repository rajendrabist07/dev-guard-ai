/**
 * Shields.io-style clean SVG badge generator
 */

export interface BadgeOptions {
  label?: string;
  value: string;
  color?: string; // hex color or preset name
  labelColor?: string;
  isSmall?: boolean;
}

const COLOR_PRESETS: Record<string, string> = {
  green: '#10b981', // emerald-500
  emerald: '#10b981',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  yellow: '#eab308',
  red: '#e11d48', // rose-600
  rose: '#f43f5e',
  gray: '#64748b',
};

function estimateTextWidth(text: string, fontSize = 11): number {
  // Approximate width for Verdana font
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/[wmWM#@]/.test(char)) width += 8.5;
    else if (/[ijlItf.,;:!]/.test(char)) width += 3.5;
    else if (/[A-Z0-9]/.test(char)) width += 7.0;
    else width += 6.0;
  }
  return Math.round((width * fontSize) / 11);
}

export function generateBadgeSvg(options: BadgeOptions): string {
  const label = options.label || 'DevGuard AI';
  const value = options.value || 'active';
  const rightBg = COLOR_PRESETS[options.color || ''] || options.color || '#10b981';
  const leftBg = options.labelColor || '#0f172a'; // slate-900

  const fontSize = 11;
  const paddingX = 7;
  const labelWidth = estimateTextWidth(label, fontSize) + paddingX * 2 + 12; // extra for icon
  const valueWidth = estimateTextWidth(value, fontSize) + paddingX * 2;
  const totalWidth = labelWidth + valueWidth;
  const height = 20;

  // Shield Icon SVG path
  const shieldIcon = `
    <g transform="translate(6, 4) scale(0.65)" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="m9 12 2 2 4-4"/>
    </g>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="${leftBg}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${rightBg}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  ${shieldIcon}
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}">
    <!-- Label Text with subtle shadow -->
    <text aria-hidden="true" x="${(labelWidth + 14) / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${(labelWidth + 14) / 2}" y="14">${label}</text>
    <!-- Value Text with subtle shadow -->
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}
