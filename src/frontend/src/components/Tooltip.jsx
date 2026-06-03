import React from 'react'

export default function Tooltip({ x, y, content }) {
  if (!content) return null
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 10, zIndex: 999,
      background: 'rgba(10,22,40,0.95)', border: '1px solid rgba(0,180,216,0.3)',
      borderRadius: '8px', padding: '0.5rem 0.75rem',
      color: '#e0e6f0', fontSize: '0.82rem', pointerEvents: 'none',
      maxWidth: '200px', lineHeight: 1.5,
    }}>
      {content}
    </div>
  )
}
