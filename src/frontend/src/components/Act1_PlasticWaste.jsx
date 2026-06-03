import React, { useEffect, useState, useMemo } from 'react'
import * as d3 from 'd3'
import WorldChoropleth from './WorldChoropleth.jsx'
import BarChart from './BarChart.jsx'
import RangeSlider from './RangeSlider.jsx'
import SearchBox from './SearchBox.jsx'
import Spinner from './Spinner.jsx'
import { fetchPlastic } from '../api.js'
import { useTheme } from '../ThemeContext.jsx'

const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 50])
const MAX_VAL = 50

export default function Act1_PlasticWaste() {
  const { colors: C } = useTheme()
  const [all, setAll] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [range, setRange] = useState([0, MAX_VAL])
  const [showBottom, setShowBottom] = useState(false)

  useEffect(() => { fetchPlastic().then(setAll) }, [])

  const filtered = useMemo(() => {
    if (!all) return []
    return all.filter((d) => d.value >= range[0] && d.value <= range[1])
  }, [all, range])

  const displayList = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.value - a.value)
    return showBottom ? sorted.slice(-20).reverse() : sorted.slice(0, 20)
  }, [filtered, showBottom])

  const handleSearch = (q) => {
    setQuery(q)
    if (!q.trim()) { setSuggestions([]); return }
    const lower = q.toLowerCase()
    setSuggestions(all.filter((d) => d.entity.toLowerCase().includes(lower)).slice(0, 8))
  }

  const selectCountry = (row) => { setSelected(row); setQuery(row.entity); setSuggestions([]) }
  const clearSearch = () => { setQuery(''); setSuggestions([]); setSelected(null) }

  if (!all) return <Spinner />

  const inRange = selected ? filtered.some((d) => d.code === selected.code) : true

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem', alignItems: 'start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <p style={{ color: C.textMuted, fontSize: '0.85rem', margin: 0 }}>
            Mismanaged plastic waste per capita (kg/person/year) — 2019.
            {' '}<span style={{ color: C.textDim }}>Showing {filtered.length} / {all.length} countries</span>
          </p>
          <div style={{ marginLeft: 'auto' }}>
            <SearchBox
              value={query} onChange={handleSearch} onClear={clearSearch}
              suggestions={suggestions} onSelect={selectCountry}
              renderSuggestion={(s) => (
                <>
                  <span>{s.entity}</span>
                  <span style={{ color: C.textDim, fontSize: '0.78rem' }}>{s.value.toFixed(1)} kg</span>
                </>
              )}
            />
          </div>
        </div>

        <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
          <p style={{ color: C.textMuted, fontSize: '0.75rem', marginBottom: '0.25rem' }}>
            Filter by mismanaged plastic per capita
          </p>
          <RangeSlider min={0} max={MAX_VAL} step={1} value={range} onChange={setRange} formatLabel={(v) => `${v} kg`} />
        </div>

        {selected && (
          <div style={{
            marginBottom: '0.75rem', padding: '0.5rem 0.9rem',
            background: inRange ? C.accentSoft : 'rgba(255,100,0,0.08)',
            border: `1px solid ${inRange ? C.accentBorder : 'rgba(255,100,0,0.3)'}`,
            borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          }}>
            <span style={{ color: inRange ? C.accent : '#ff6400', fontWeight: 700 }}>{selected.entity}</span>
            <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>{selected.value.toFixed(2)} kg/person/yr</span>
            <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>
              Rank #{[...all].sort((a, b) => b.value - a.value).findIndex((d) => d.code === selected.code) + 1} of {all.length}
            </span>
            {!inRange && <span style={{ color: '#ff6400', fontSize: '0.78rem' }}>outside current range</span>}
          </div>
        )}

        <WorldChoropleth
          data={filtered} colorScale={colorScale}
          valueFormat={(v) => `${v.toFixed(1)} kg/person/yr`}
          onCountryClick={selectCountry} selectedCode={selected?.code}
          width={760} height={400}
        />
        <Legend scale={colorScale} label="kg / person / year" C={C} />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <p style={{ color: C.textMuted, fontSize: '0.82rem', margin: 0 }}>
            {showBottom ? 'Bottom 20' : 'Top 20'} within range ({range[0]}–{range[1]} kg)
          </p>
          <button onClick={() => setShowBottom((v) => !v)} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '6px', padding: '0.2rem 0.6rem',
            color: C.textMuted, fontSize: '0.75rem', cursor: 'pointer',
          }}>
            Show {showBottom ? 'top' : 'bottom'}
          </button>
        </div>
        <BarChart data={displayList} colorScale={colorScale} selectedCode={selected?.code} onSelect={selectCountry} width={360} height={440} />
      </div>
    </div>
  )
}

function Legend({ scale, label, C }) {
  const steps = 10, w = 200, h = 12
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
      <svg width={w} height={h}>
        {Array.from({ length: steps }, (_, i) => {
          const t = i / (steps - 1)
          const [lo, hi] = scale.domain()
          return <rect key={i} x={i * (w / steps)} y={0} width={w / steps} height={h} fill={scale(lo + t * (hi - lo))} />
        })}
      </svg>
      <span style={{ color: C.textMuted, fontSize: '0.75rem' }}>{label}</span>
    </div>
  )
}
