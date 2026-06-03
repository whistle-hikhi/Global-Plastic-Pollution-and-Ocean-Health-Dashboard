export const DARK = {
  bg: '#0a1628',
  surface: 'rgba(255,255,255,0.04)',
  surfaceStrong: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  textPrimary: '#e0e6f0',
  textSecondary: '#8899bb',
  textMuted: '#6b80a0',
  textDim: '#4a6080',
  accent: '#00b4d8',
  accentSoft: 'rgba(0,180,216,0.15)',
  accentBorder: 'rgba(0,180,216,0.3)',
  mapOcean: '#0d2137',
  mapLand: '#162d4a',
  mapBorder: '#0a1628',
  inputBg: 'rgba(255,255,255,0.05)',
  dropdownBg: '#0f2035',
  headerBg: 'rgba(10,22,40,0.95)',
}

export const LIGHT = {
  bg: '#f0f5fb',
  surface: 'rgba(0,0,0,0.04)',
  surfaceStrong: 'rgba(0,0,0,0.08)',
  border: 'rgba(0,0,0,0.1)',
  borderStrong: 'rgba(0,0,0,0.2)',
  textPrimary: '#12253d',
  textSecondary: '#3a5575',
  textMuted: '#5a7898',
  textDim: '#7a98b8',
  accent: '#0088aa',
  accentSoft: 'rgba(0,136,170,0.12)',
  accentBorder: 'rgba(0,136,170,0.35)',
  mapOcean: '#c2d8ec',
  mapLand: '#dce8f2',
  mapBorder: '#aac4d8',
  inputBg: 'rgba(0,0,0,0.06)',
  dropdownBg: '#e8f0f8',
  headerBg: 'rgba(240,245,251,0.96)',
}

export function cssVars(c) {
  return `
    --bg:${c.bg};--surface:${c.surface};--surface-strong:${c.surfaceStrong};
    --border:${c.border};--border-strong:${c.borderStrong};
    --text-primary:${c.textPrimary};--text-secondary:${c.textSecondary};
    --text-muted:${c.textMuted};--text-dim:${c.textDim};
    --accent:${c.accent};--accent-soft:${c.accentSoft};--accent-border:${c.accentBorder};
    --input-bg:${c.inputBg};--dropdown-bg:${c.dropdownBg};--header-bg:${c.headerBg};
  `
}
