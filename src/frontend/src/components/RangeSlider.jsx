import React from 'react'

const STYLE_ID = 'range-slider-css'
const CSS = `
.rs-wrap { position: relative; padding: 0 4px; }
.rs-track { position: relative; height: 4px; border-radius: 2px; background: var(--border-strong, #1a2f4a); margin: 14px 0 8px; }
.rs-fill  { position: absolute; height: 100%; border-radius: 2px; background: var(--accent, #00b4d8); }
.rs-inputs { position: relative; height: 0; }
.rs-inputs input[type=range] {
  -webkit-appearance: none; appearance: none;
  position: absolute; width: 100%; top: -16px; margin: 0;
  background: transparent; pointer-events: none;
}
.rs-inputs input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: #00b4d8; border: 2px solid #0a1628;
  cursor: pointer; pointer-events: all;
  box-shadow: 0 0 4px rgba(0,180,216,0.5);
}
.rs-inputs input[type=range]::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: #00b4d8; border: 2px solid #0a1628;
  cursor: pointer; pointer-events: all;
}
`

function injectCSS() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style')
    s.id = STYLE_ID
    s.textContent = CSS
    document.head.appendChild(s)
  }
}

export default function RangeSlider({ min, max, value, onChange, step = 1, formatLabel }) {
  injectCSS()
  const [lo, hi] = value
  const pctLo = ((lo - min) / (max - min)) * 100
  const pctHi = ((hi - min) / (max - min)) * 100

  const setLo = (v) => onChange([Math.min(Number(v), hi - step), hi])
  const setHi = (v) => onChange([lo, Math.max(Number(v), lo + step)])

  const fmt = formatLabel || ((v) => v)

  return (
    <div className="rs-wrap">
      <div className="rs-track">
        <div className="rs-fill" style={{ left: `${pctLo}%`, width: `${pctHi - pctLo}%` }} />
      </div>
      <div className="rs-inputs">
        <input type="range" min={min} max={max} step={step} value={lo}
          onChange={(e) => setLo(e.target.value)}
          style={{ zIndex: pctLo > 50 ? 5 : 3 }}
        />
        <input type="range" min={min} max={max} step={step} value={hi}
          onChange={(e) => setHi(e.target.value)}
          style={{ zIndex: pctLo > 50 ? 4 : 5 }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{fmt(min)}</span>
        <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}>
          {fmt(lo)} — {fmt(hi)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{fmt(max)}</span>
      </div>
    </div>
  )
}
