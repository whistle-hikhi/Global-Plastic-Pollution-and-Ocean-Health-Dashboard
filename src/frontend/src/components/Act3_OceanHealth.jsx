import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import WorldChoropleth from './WorldChoropleth.jsx'
import RadarChart from './RadarChart.jsx'
import LineChart from './LineChart.jsx'
import RangeSlider from './RangeSlider.jsx'
import SearchBox from './SearchBox.jsx'
import Spinner from './Spinner.jsx'
import { fetchOHI, fetchOHITrend, fetchOHIRadar, fetchForecast } from '../api.js'
import { useTheme } from '../ThemeContext.jsx'

const colorScale = d3.scaleSequential(d3.interpolateGnBu).domain([100, 30])

const OHI_ISO_MAP = {
  'Albania': 'ALB', 'Algeria': 'DZA', 'Angola': 'AGO', 'Argentina': 'ARG',
  'Australia': 'AUS', 'Bangladesh': 'BGD', 'Belgium': 'BEL', 'Belize': 'BLZ',
  'Benin': 'BEN', 'Brazil': 'BRA', 'Cambodia': 'KHM', 'Cameroon': 'CMR',
  'Canada': 'CAN', 'Chile': 'CHL', 'China': 'CHN', 'Colombia': 'COL',
  'Croatia': 'HRV', 'Cuba': 'CUB', 'Denmark': 'DNK', 'Ecuador': 'ECU',
  'Egypt': 'EGY', 'Eritrea': 'ERI', 'Ethiopia': 'ETH', 'Finland': 'FIN',
  'France': 'FRA', 'Germany': 'DEU', 'Ghana': 'GHA', 'Guatemala': 'GTM',
  'Haiti': 'HTI', 'Honduras': 'HND', 'India': 'IND', 'Indonesia': 'IDN',
  'Iran': 'IRN', 'Iraq': 'IRQ', 'Ireland': 'IRL', 'Israel': 'ISR',
  'Italy': 'ITA', 'Jamaica': 'JAM', 'Japan': 'JPN', 'Jordan': 'JOR',
  'Kenya': 'KEN', 'Kuwait': 'KWT', 'Laos': 'LAO', 'Lebanon': 'LBN',
  'Libya': 'LBY', 'Madagascar': 'MDG', 'Malaysia': 'MYS', 'Maldives': 'MDV',
  'Mexico': 'MEX', 'Morocco': 'MAR', 'Mozambique': 'MOZ', 'Myanmar': 'MMR',
  'Netherlands': 'NLD', 'New Zealand': 'NZL', 'Nicaragua': 'NIC',
  'Nigeria': 'NGA', 'Norway': 'NOR', 'Pakistan': 'PAK', 'Panama': 'PAN',
  'Peru': 'PER', 'Philippines': 'PHL', 'Poland': 'POL', 'Portugal': 'PRT',
  'Qatar': 'QAT', 'Romania': 'ROU', 'Russia': 'RUS', 'Saudi Arabia': 'SAU',
  'Senegal': 'SEN', 'Sierra Leone': 'SLE', 'Somalia': 'SOM',
  'South Africa': 'ZAF', 'South Korea': 'KOR', 'Spain': 'ESP',
  'Sri Lanka': 'LKA', 'Sudan': 'SDN', 'Sweden': 'SWE', 'Syria': 'SYR',
  'Tanzania': 'TZA', 'Thailand': 'THA', 'Tunisia': 'TUN', 'Turkey': 'TUR',
  'Uganda': 'UGA', 'Ukraine': 'UKR', 'United Arab Emirates': 'ARE',
  'United Kingdom': 'GBR', 'United States': 'USA', 'Uruguay': 'URY',
  'Venezuela': 'VEN', 'Vietnam': 'VNM', 'Yemen': 'YEM',
}

export default function Act3_OceanHealth() {
  const { colors: C } = useTheme()
  const [yearRange, setYearRange] = useState([2012, 2023])
  const [scores, setScores] = useState(null)
  const [selected, setSelected] = useState(null)
  const [trend, setTrend] = useState(null)
  const [radar, setRadar] = useState(null)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showBottom, setShowBottom] = useState(false)
  const [scoreRange, setScoreRange] = useState([0, 100])
  const [forecastModel, setForecastModel] = useState(null)   // null = hidden
  const [forecastData, setForecastData] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastMeta, setForecastMeta] = useState(null)

  const FORECAST_MODELS = [
    { id: 'linear',       label: 'Linear',      short: 'Linear Regression' },
    { id: 'polynomial',   label: 'Poly(2)',      short: 'Polynomial deg-2'  },
    { id: 'holt_winters', label: 'Holt-Winters', short: 'Holt-Winters ES'  },
    { id: 'arima',        label: 'ARIMA',        short: 'ARIMA(1,1,1)'     },
  ]

  const listRef = useRef()
  const rowRefs = useRef({})

  const endYear = yearRange[1]

  useEffect(() => {
    setScores(null)
    fetchOHI('Index', 'score', endYear).then((data) => {
      const mapped = data
        .filter((d) => OHI_ISO_MAP[d.region_name])
        .map((d) => ({ ...d, code: OHI_ISO_MAP[d.region_name], entity: d.region_name }))
      setScores(mapped)
    })
  }, [endYear])

  const sortedScores = useMemo(() => {
    if (!scores) return []
    return [...scores].sort((a, b) => b.value - a.value)
  }, [scores])

  const scoreFiltered = useMemo(() => {
    return sortedScores.filter((s) => s.value >= scoreRange[0] && s.value <= scoreRange[1])
  }, [sortedScores, scoreRange])

  const displayList = useMemo(() => {
    return showBottom ? [...scoreFiltered].reverse().slice(0, 20) : scoreFiltered.slice(0, 20)
  }, [scoreFiltered, showBottom])

  const selectCountry = useCallback((ohiRow) => {
    if (!ohiRow) return
    setSelected(ohiRow)
    setQuery(ohiRow.entity)
    setSuggestions([])
    setForecastModel(null); setForecastData(null); setForecastMeta(null)
    Promise.all([
      fetchOHITrend(ohiRow.region_id, 'Index', 'score'),
      fetchOHIRadar(ohiRow.region_id, endYear),
    ]).then(([t, r]) => { setTrend(t); setRadar(r) })
  }, [endYear])

  // Scroll selected row into view in the list
  useEffect(() => {
    if (!selected) return
    const el = rowRefs.current[selected.code]
    if (el && listRef.current) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const handleCountryClick = useCallback((row) => {
    const ohiRow = scores?.find((s) => s.code === row.code)
    selectCountry(ohiRow)
  }, [scores, selectCountry])

  const handleSearch = (q) => {
    setQuery(q)
    if (!q.trim() || !scores) { setSuggestions([]); return }
    const lower = q.toLowerCase()
    setSuggestions(scores.filter((s) => s.entity.toLowerCase().includes(lower)).slice(0, 8))
  }

  const runForecast = useCallback((modelId) => {
    if (!selected) return
    if (forecastModel === modelId) { setForecastModel(null); setForecastData(null); setForecastMeta(null); return }
    setForecastModel(modelId)
    setForecastLoading(true)
    fetchForecast(selected.region_id, modelId, 5).then((res) => {
      setForecastLoading(false)
      if (res.error) { setForecastData(null); setForecastMeta({ error: res.error }); return }
      setForecastData(res.forecast)
      setForecastMeta({ label: res.model_label, ...res.metrics })
    })
  }, [selected, forecastModel])

  const clearSearch = () => {
    setQuery('')
    setSuggestions([])
    setSelected(null)
    setTrend(null)
    setRadar(null)
  }

  const selectedRank = useMemo(() => {
    if (!selected || !sortedScores.length) return null
    return sortedScores.findIndex((s) => s.code === selected.code) + 1
  }, [selected, sortedScores])

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ color: C.textMuted, fontSize: '0.85rem', margin: 0 }}>
            Ocean Health Index (OHI) — composite score 0–100.
          </p>
          <div style={{ marginLeft: 'auto' }}>
            <SearchBox
              value={query} onChange={handleSearch} onClear={clearSearch}
              suggestions={suggestions} onSelect={selectCountry}
              renderSuggestion={(s) => (
                <>
                  <span>{s.entity}</span>
                  <span style={{ color: C.textDim, fontSize: '0.78rem' }}>OHI {s.value?.toFixed(1)}</span>
                </>
              )}
            />
          </div>
        </div>
        <div style={{ maxWidth: 520, padding: '0.6rem 0.9rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
          <p style={{ color: C.textMuted, fontSize: '0.75rem', marginBottom: '0.25rem' }}>
            Year range — choropleth shows end year ({endYear}), trend shows full range
          </p>
          <RangeSlider min={2012} max={2025} step={1} value={yearRange} onChange={setYearRange} />
        </div>
      </div>

      {selected && (
        <div style={{
          marginBottom: '0.75rem', padding: '0.5rem 0.9rem',
          background: C.accentSoft, border: `1px solid ${C.accentBorder}`,
          borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        }}>
          <span style={{ color: C.accent, fontWeight: 700 }}>{selected.entity}</span>
          <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>
            OHI {endYear}: <strong style={{ color: C.textPrimary }}>{selected.value?.toFixed(1)}</strong>
          </span>
          <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>
            Rank <strong style={{ color: C.accent }}>#{selectedRank}</strong> of {sortedScores.length}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>

        {/* ── LEFT: map + trend chart ── */}
        <div>
          {!scores ? <Spinner /> : (
            <WorldChoropleth
              data={scores} colorScale={colorScale}
              valueFormat={(v) => `OHI: ${v.toFixed(1)}`}
              onCountryClick={handleCountryClick} selectedCode={selected?.code}
              width={760} height={400}
            />
          )}

          {/* Trend + forecast fills the empty left space */}
          {selected && trend && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
              {/* Forecast model selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                <p style={{ color: C.textMuted, fontSize: '0.75rem', margin: 0 }}>
                  OHI trend &amp; forecast · {selected.entity}
                  <span style={{ color: C.textDim }}> · click a model for 5-year horizon</span>
                </p>
                <div style={{ display: 'flex', gap: '0.3rem', marginLeft: 'auto' }}>
                  {FORECAST_MODELS.map((fm) => {
                    const active = forecastModel === fm.id
                    return (
                      <button key={fm.id} onClick={() => runForecast(fm.id)} title={fm.short}
                        style={{
                          padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem',
                          cursor: 'pointer', transition: 'all 0.15s',
                          background: active ? C.accentSoft : C.surface,
                          border: `1px solid ${active ? C.accent : C.border}`,
                          color: active ? C.accent : C.textSecondary,
                          fontWeight: active ? 700 : 400,
                        }}>
                        {fm.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Metrics */}
              {forecastModel && (forecastLoading
                ? <p style={{ color: C.textDim, fontSize: '0.72rem', marginBottom: '0.4rem' }}>Running {forecastModel}…</p>
                : forecastMeta?.error
                  ? <p style={{ color: '#ff6400', fontSize: '0.72rem', marginBottom: '0.4rem' }}>{forecastMeta.error}</p>
                  : forecastMeta && (
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.4rem', fontSize: '0.72rem', color: C.textDim }}>
                      <span>Model: <strong style={{ color: C.textSecondary }}>{forecastMeta.label}</strong></span>
                      <span>R² <strong style={{ color: C.accent }}>{forecastMeta.r2}</strong></span>
                      <span>MAE <strong style={{ color: C.accent }}>{forecastMeta.mae}</strong></span>
                    </div>
                  )
              )}

              <LineChart
                data={trend.filter((d) => d.year >= yearRange[0] && d.year <= yearRange[1])}
                forecast={forecastModel && !forecastLoading ? forecastData : null}
                title=""
                width={720} height={200}
              />
            </div>
          )}
        </div>

        {/* ── RIGHT: filters + ranking + radar ── */}
        <div>
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
            <p style={{ color: C.textMuted, fontSize: '0.72rem', marginBottom: '0.25rem' }}>
              Filter by OHI score · {scoreFiltered.length} / {sortedScores.length} countries
            </p>
            <RangeSlider min={0} max={100} step={1} value={scoreRange} onChange={setScoreRange} formatLabel={(v) => `${v}`} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <p style={{ color: C.textMuted, fontSize: '0.82rem', margin: 0 }}>
              {showBottom ? 'Bottom 20' : 'Top 20'} in range — OHI {endYear}
            </p>
            <button onClick={() => setShowBottom((v) => !v)} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: '6px', padding: '0.2rem 0.6rem',
              color: C.textMuted, fontSize: '0.75rem', cursor: 'pointer',
            }}>
              Show {showBottom ? 'top' : 'bottom'}
            </button>
          </div>

          <div ref={listRef} style={{ maxHeight: 300, overflowY: 'auto', marginBottom: '1rem' }}>
            {!scores ? <Spinner /> : displayList.map((c, i) => {
              const rank = showBottom ? sortedScores.length - i : i + 1
              const isSelected = selected?.code === c.code
              const barColor = colorScale(c.value)
              return (
                <div key={c.code}
                  ref={(el) => { rowRefs.current[c.code] = el }}
                  onClick={() => selectCountry(c)}
                  style={{
                    padding: '0.3rem 0.5rem', borderRadius: 6, marginBottom: 2,
                    cursor: 'pointer', transition: 'all 0.12s',
                    background: isSelected ? C.accentSoft : 'transparent',
                    border: isSelected ? `1px solid ${C.accentBorder}` : '1px solid transparent',
                    boxShadow: isSelected ? `inset 3px 0 0 ${C.accent}` : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = C.accentSoft
                      e.currentTarget.style.border = `1px solid ${C.accentBorder}`
                      e.currentTarget.style.boxShadow = `inset 3px 0 0 ${C.accent}`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.border = '1px solid transparent'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 3 }}>
                    <span style={{ color: C.textDim, fontSize: '0.7rem', minWidth: 22, textAlign: 'right' }}>#{rank}</span>
                    <span style={{ color: C.textPrimary, fontSize: '0.82rem', flex: 1 }}>{c.entity}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: isSelected ? 700 : 400, color: isSelected ? C.accent : C.textSecondary }}>
                      {c.value?.toFixed(1)}
                    </span>
                  </div>
                  <div style={{ marginLeft: 26 }}>
                    <div style={{ height: 3, borderRadius: 2, width: `${(c.value / 100) * 100}%`, background: barColor, opacity: isSelected ? 1 : 0.6 }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Radar in right panel */}
          {selected ? (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem' }}>
              <p style={{ color: C.textMuted, fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                Sub-goal breakdown · {selected.entity}
              </p>
              {radar && <RadarChart data={radar} width={300} height={280} />}
            </div>
          ) : (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem', color: C.textDim, fontSize: '0.82rem' }}>
              Click a row or the map to see sub-goal breakdown and trend.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
