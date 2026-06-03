import React from 'react'
import { useTheme } from '../ThemeContext.jsx'

export default function SearchBox({ value, onChange, onClear, suggestions, onSelect, renderSuggestion, placeholder = 'Search country…' }) {
  const { colors: C } = useTheme()

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: C.inputBg,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: '8px',
          padding: '0.35rem 2rem 0.35rem 0.7rem',
          color: C.textPrimary,
          fontSize: '0.85rem',
          outline: 'none',
          width: '180px',
        }}
      />
      {value && (
        <button
          onClick={onClear}
          style={{
            position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer',
            fontSize: '0.9rem', lineHeight: 1, padding: 0,
          }}
        >×</button>
      )}
      {suggestions && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: C.dropdownBg, border: `1px solid ${C.accentBorder}`,
          borderRadius: '8px', marginTop: '4px', padding: '0.25rem 0',
          listStyle: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          {suggestions.map((s, i) => (
            <li
              key={i}
              onClick={() => onSelect(s)}
              style={{
                padding: '0.4rem 0.75rem', cursor: 'pointer',
                color: C.textPrimary, fontSize: '0.85rem',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.accentSoft}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {renderSuggestion(s)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
