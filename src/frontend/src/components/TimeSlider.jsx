import React from 'react'

export default function TimeSlider({ year, onChange, min = 2012, max = 2025 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <span style={{ color: '#6b80a0', fontSize: '0.82rem' }}>{min}</span>
      <input
        type="range" min={min} max={max} value={year}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ flex: 1, accentColor: '#00b4d8', cursor: 'pointer' }}
      />
      <span style={{ color: '#6b80a0', fontSize: '0.82rem' }}>{max}</span>
      <span style={{
        background: 'rgba(0,180,216,0.15)', border: '1px solid rgba(0,180,216,0.4)',
        borderRadius: '6px', padding: '0.2rem 0.6rem', color: '#00b4d8',
        fontWeight: 700, fontSize: '0.9rem', minWidth: '52px', textAlign: 'center',
      }}>
        {year}
      </span>
    </div>
  )
}
