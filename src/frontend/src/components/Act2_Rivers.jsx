import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import RangeSlider from './RangeSlider.jsx'
import SearchBox from './SearchBox.jsx'
import Spinner from './Spinner.jsx'
import { fetchRivers, fetchRiversByCountry, fetchRiversByContinent } from '../api.js'
import { useTheme } from '../ThemeContext.jsx'

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'
let _topoCache = null
async function getWorld() {
  if (!_topoCache) _topoCache = await fetch(TOPO_URL).then((r) => r.json())
  return _topoCache
}

const CONTINENT_COLORS = {
  'Asia': '#ef6c00',
  'Africa': '#c62828',
  'South America': '#6a1b9a',
  'North America': '#1565c0',
  'Europe': '#2e7d32',
  'Oceania': '#00838f',
}

const W = 860, H = 430

function fmtEmission(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M t/yr`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k t/yr`
  return `${v.toFixed(1)} t/yr`
}

export default function Act2_Rivers() {
  const { colors: C } = useTheme()
  const svgRef = useRef()
  const zoomRef = useRef()
  const gRef = useRef()
  const pathRef = useRef()
  const iso3MapRef = useRef({})
  const featuresRef = useRef([])

  const [rivers, setRivers] = useState(null)
  const [byCountry, setByCountry] = useState(null)
  const [allCountries, setAllCountries] = useState(null)
  const [byContinent, setByContinent] = useState(null)
  const [highlighted, setHighlighted] = useState(null)
  const [selectedContinent, setSelectedContinent] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [emRange, setEmRange] = useState([0, 300000])

  const listRef = useRef()
  const rowRefs = useRef({})

  useEffect(() => {
    Promise.all([
      fetchRivers(500),
      fetchRiversByCountry(20),
      fetchRiversByCountry(200),
      fetchRiversByContinent(),
    ]).then(([r, top20, all, cont]) => {
      setRivers(r)
      setByCountry(top20)
      setAllCountries(all)
      setByContinent(cont)
      setEmRange([0, 300000])
    })
  }, [])

  // Build map
  useEffect(() => {
    if (!rivers || !byCountry) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const projection = d3.geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' })
    const path = d3.geoPath(projection)
    pathRef.current = path

    const emissionByIso3 = {}
    byCountry.forEach((d) => { if (d.iso3) emissionByIso3[d.iso3] = d.total_emissions })
    const maxEmission = d3.max(Object.values(emissionByIso3)) || 1
    const colorScale = d3.scaleSequential(d3.interpolateOranges).domain([0, Math.sqrt(maxEmission)])

    const rScale = d3.scaleSqrt()
      .domain([0, d3.max(rivers, (d) => d.emissions)])
      .range([1, 12])

    const g = svg.append('g')
    gRef.current = g

    const zoom = d3.zoom()
      .scaleExtent([1, 10])
      .translateExtent([[0, 0], [W, H]])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        const k = event.transform.k
        g.selectAll('.country-sel').attr('stroke-width', 2 / k)
      })
    zoomRef.current = zoom
    svg.call(zoom).on('dblclick.zoom', null)

    getWorld().then((world) => {
      const countries = topojson.feature(world, world.objects.countries)
      iso3MapRef.current = buildIso3Map(world)
      featuresRef.current = countries.features

      g.append('path').datum({ type: 'Sphere' }).attr('d', path).attr('fill', C.mapOcean)

      g.selectAll('.country')
        .data(countries.features)
        .join('path')
        .attr('class', 'country')
        .attr('d', path)
        .attr('fill', (f) => {
          const iso3 = iso3MapRef.current[f.id]
          const em = iso3 ? emissionByIso3[iso3] : null
          return em ? colorScale(Math.sqrt(em)) : C.mapLand
        })
        .attr('stroke', C.mapBorder)
        .attr('stroke-width', 0.4)

      // Invisible selection overlay (drawn on top, updated by selectedCode effect)
      g.append('path').attr('class', 'country-sel')
        .attr('fill', 'none')
        .attr('stroke', '#00b4d8')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'none')

      g.selectAll('.river-dot')
        .data(rivers)
        .join('circle')
        .attr('class', 'river-dot')
        .attr('cx', (d) => { const p = projection([d.lon, d.lat]); return p ? p[0] : -9999 })
        .attr('cy', (d) => { const p = projection([d.lon, d.lat]); return p ? p[1] : -9999 })
        .attr('r', (d) => rScale(d.emissions))
        .attr('fill', 'rgba(0,180,216,0.5)')
        .attr('stroke', 'rgba(0,180,216,0.85)')
        .attr('stroke-width', 0.4)
        .style('pointer-events', 'none')
    })
  }, [rivers, byCountry, C])

  // Highlight + zoom when selected changes
  useEffect(() => {
    if (!gRef.current || !pathRef.current) return
    const iso3 = selected?.iso3
    const feature = iso3
      ? featuresRef.current.find((f) => iso3MapRef.current[f.id] === iso3)
      : null

    // Update selection outline
    gRef.current.select('.country-sel')
      .attr('d', feature ? pathRef.current(feature) : null)

    if (!feature || !zoomRef.current || !svgRef.current) return

    // Auto-zoom to country
    const [[x0, y0], [x1, y1]] = pathRef.current.bounds(feature)
    const bw = x1 - x0, bh = y1 - y0
    if (bw === 0 || bh === 0) return
    const padding = 40
    const scale = Math.min(8, 0.9 / Math.max(bw / (W - padding * 2), bh / (H - padding * 2)))
    const tx = W / 2 - scale * (x0 + bw / 2)
    const ty = H / 2 - scale * (y0 + bh / 2)
    d3.select(svgRef.current)
      .transition().duration(700)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }, [selected])

  // Scroll selected country into view in the ranking list
  useEffect(() => {
    if (!selected) return
    const el = rowRefs.current[selected.country]
    if (el && listRef.current) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selected])

  const selectCountry = useCallback((row) => {
    setSelected(row)
    setQuery(row.country)
    setSuggestions([])
    setHighlighted(row.continent)
  }, [])

  const handleSearch = (q) => {
    setQuery(q)
    if (!q.trim() || !allCountries) { setSuggestions([]); return }
    const lower = q.toLowerCase()
    setSuggestions(allCountries.filter((c) => c.country.toLowerCase().includes(lower)).slice(0, 8))
  }

  const clearSearch = () => {
    setQuery('')
    setSuggestions([])
    setSelected(null)
    setHighlighted(null)
    setSelectedContinent(null)
    if (zoomRef.current && svgRef.current) {
      d3.select(svgRef.current).transition().duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity)
    }
  }

  const [showBottom, setShowBottom] = useState(false)

  // When a continent is active, draw from allCountries so we get full coverage (not just global top-20)
  const filteredByRange = useMemo(() => {
    if (!byCountry || !allCountries) return []
    const source = selectedContinent
      ? allCountries.filter((c) => c.continent === selectedContinent)
      : byCountry
    const inRange = source.filter((c) => c.total_emissions >= emRange[0] && c.total_emissions <= emRange[1])
    const sorted = [...inRange].sort((a, b) => b.total_emissions - a.total_emissions)
    return showBottom ? sorted.slice(-20).reverse() : sorted.slice(0, 20)
  }, [byCountry, allCountries, emRange, showBottom, selectedContinent])

  if (!rivers || !byCountry || !byContinent) return <Spinner />

  const totalAll = byContinent.reduce((s, d) => s + d.total_emissions, 0)
  const topContinent = byContinent[0]
  const selectedRank = selected
    ? allCountries?.findIndex((c) => c.country === selected.country) + 1
    : null
  const maxEm = 300000
  const selectedInRange = selected
    ? (selected.total_emissions >= emRange[0] && selected.total_emissions <= emRange[1])
    : true

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ color: C.textMuted, fontSize: '0.82rem', margin: 0 }}>
            Plastic river emissions by continent —{' '}
            <span style={{ color: C.textPrimary }}>{topContinent?.continent}</span> dominates with{' '}
            <span style={{ color: '#ef6c00', fontWeight: 700 }}>
              {((topContinent?.total_emissions / totalAll) * 100).toFixed(0)}%
            </span> of all emission points.
          </p>
          <div style={{ marginLeft: 'auto' }}>
            <SearchBox
              value={query} onChange={handleSearch} onClear={clearSearch}
              suggestions={suggestions} onSelect={selectCountry}
              renderSuggestion={(s) => (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: CONTINENT_COLORS[s.continent] || C.textDim, flexShrink: 0 }} />
                    {s.country}
                  </span>
                  <span style={{ color: C.textDim, fontSize: '0.78rem' }}>{fmtEmission(s.total_emissions)}</span>
                </>
              )}
            />
          </div>
        </div>

        {selected && (
          <div style={{
            marginBottom: '0.75rem', padding: '0.5rem 0.9rem',
            background: `${CONTINENT_COLORS[selected.continent] || C.accent}18`,
            border: `1px solid ${CONTINENT_COLORS[selected.continent] || C.accent}50`,
            borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: CONTINENT_COLORS[selected.continent] || C.accent, flexShrink: 0 }} />
            <span style={{ color: C.textPrimary, fontWeight: 700 }}>{selected.country}</span>
            <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>{selected.continent}</span>
            <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>
              Emissions: <span style={{ color: C.textPrimary }}>{fmtEmission(selected.total_emissions)}</span>
            </span>
            <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>{selected.point_count.toLocaleString()} outlet points</span>
            {selectedRank && (
              <span style={{ color: C.textSecondary, fontSize: '0.85rem' }}>
                Rank <span style={{ color: C.accent, fontWeight: 700 }}>#{selectedRank}</span>
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {byContinent.map((c, i) => {
            const pct = ((c.total_emissions / totalAll) * 100).toFixed(1)
            const color = CONTINENT_COLORS[c.continent] || C.textDim
            const isPinned = selectedContinent === c.continent
            const isActive = isPinned || highlighted === c.continent || selected?.continent === c.continent
            return (
              <div key={c.continent} style={{
                padding: '0.5rem 0.8rem', borderRadius: 8, minWidth: 110,
                background: isPinned ? `${color}35` : isActive ? `${color}22` : C.surface,
                border: `1px solid ${isPinned ? color : isActive ? `${color}88` : C.border}`,
                boxShadow: isPinned ? `0 0 10px ${color}40, inset 0 -2px 0 ${color}` : 'none',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onClick={() => setSelectedContinent((prev) => prev === c.continent ? null : c.continent)}
                onMouseEnter={() => setHighlighted(c.continent)}
                onMouseLeave={() => setHighlighted(null)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, ...(i === 0 ? { boxShadow: `0 0 6px ${color}` } : {}) }} />
                  <span style={{ color: C.textPrimary, fontSize: '0.78rem', fontWeight: 600 }}>{c.continent}</span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: i === 0 ? color : C.textSecondary }}>{pct}%</div>
                <div style={{ fontSize: '0.72rem', color: C.textDim }}>{c.point_count.toLocaleString()} points</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '2rem', alignItems: 'start' }}>
        <div style={{ position: 'relative' }}>
          <svg ref={svgRef} width={W} height={H} style={{ display: 'block', borderRadius: 8, cursor: 'grab' }} />
          <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { l: '+', fn: () => d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1.5) },
              { l: '−', fn: () => d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1 / 1.5) },
              { l: '⟳', fn: clearSearch },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn} style={{
                width: 26, height: 26, borderRadius: 5,
                background: C.headerBg, border: `1px solid ${C.accentBorder}`,
                color: C.accent, cursor: 'pointer', fontSize: l === '⟳' ? '0.85rem' : '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width={140} height={10}>
              {Array.from({ length: 10 }, (_, i) => (
                <rect key={i} x={i * 14} y={0} width={14} height={10} fill={d3.scaleSequential(d3.interpolateOranges).domain([0, 1])(i / 9)} />
              ))}
            </svg>
            <span style={{ color: C.textMuted, fontSize: '0.72rem' }}>emission intensity (t/yr, √-scaled) · dots = outlet points</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <p style={{ color: C.textMuted, fontSize: '0.82rem', margin: 0 }}>
              {showBottom ? 'Bottom 20' : 'Top 20'}
              {selectedContinent
                ? <> in <span style={{ color: CONTINENT_COLORS[selectedContinent] || C.accent, fontWeight: 700 }}>{selectedContinent}</span></>
                : ' in range'}
              {' '}({filteredByRange.length})
            </p>
            <button onClick={() => setShowBottom((v) => !v)} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: '6px', padding: '0.2rem 0.6rem',
              color: C.textMuted, fontSize: '0.75rem', cursor: 'pointer',
            }}>
              Show {showBottom ? 'top' : 'bottom'}
            </button>
          </div>
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
            <p style={{ color: C.textMuted, fontSize: '0.72rem', marginBottom: '0.25rem' }}>Filter by emission</p>
            <RangeSlider min={0} max={maxEm} step={1000} value={emRange} onChange={setEmRange} formatLabel={fmtEmission} />
          </div>
          <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto' }}>
            {filteredByRange.map((c, i) => {
              const color = CONTINENT_COLORS[c.continent] || C.textDim
              const pct = c.total_emissions / byCountry[0].total_emissions
              const isSelected = selected?.country === c.country
              const isHighlighted = !isSelected && (highlighted === c.continent || highlighted === c.country)
              return (
                <div key={c.country}
                  ref={(el) => { rowRefs.current[c.country] = el }}
                  onClick={() => selectCountry(c)}
                  onMouseEnter={() => !selected && setHighlighted(c.continent)}
                  onMouseLeave={() => !selected && setHighlighted(null)}
                  style={{
                    padding: '0.35rem 0.5rem', borderRadius: 6, marginBottom: '2px',
                    cursor: 'pointer', transition: 'all 0.12s',
                    background: isSelected ? `${color}35` : isHighlighted ? `${color}22` : 'transparent',
                    border: isSelected ? `1px solid ${color}70` : isHighlighted ? `1px solid ${color}55` : '1px solid transparent',
                    boxShadow: (isSelected || isHighlighted) ? `inset 3px 0 0 ${color}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '3px' }}>
                    <span style={{ color: C.textDim, fontSize: '0.72rem', minWidth: 18, textAlign: 'right' }}>#{i + 1}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ color: C.textPrimary, fontSize: '0.82rem', flex: 1 }}>{c.country}</span>
                    <span style={{ color: C.textMuted, fontSize: '0.72rem' }}>{fmtEmission(c.total_emissions)}</span>
                  </div>
                  <div style={{ marginLeft: 30 }}>
                    <div style={{ height: 3, borderRadius: 2, width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                  </div>
                </div>
              )
            })}
            {filteredByRange.length === 0 && (
              <p style={{ color: C.textDim, fontSize: '0.82rem', padding: '0.5rem' }}>No countries in this range.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const ISO_LOOKUP = {
  4:'AFG',8:'ALB',12:'DZA',16:'ASM',20:'AND',24:'AGO',28:'ATG',31:'AZE',32:'ARG',36:'AUS',
  40:'AUT',44:'BHS',48:'BHR',50:'BGD',51:'ARM',52:'BRB',56:'BEL',60:'BMU',64:'BTN',68:'BOL',
  70:'BIH',72:'BWA',76:'BRA',84:'BLZ',86:'IOT',90:'SLB',92:'VGB',96:'BRN',
  100:'BGR',104:'MMR',108:'BDI',112:'BLR',116:'KHM',120:'CMR',124:'CAN',132:'CPV',
  136:'CYM',140:'CAF',144:'LKA',148:'TCD',152:'CHL',156:'CHN',158:'TWN',170:'COL',
  174:'COM',178:'COG',180:'COD',184:'COK',188:'CRI',191:'HRV',192:'CUB',196:'CYP',
  203:'CZE',204:'BEN',208:'DNK',212:'DMA',214:'DOM',218:'ECU',222:'SLV',226:'GNQ',
  231:'ETH',232:'ERI',233:'EST',234:'FRO',238:'FLK',242:'FJI',246:'FIN',250:'FRA',
  258:'PYF',262:'DJI',266:'GAB',268:'GEO',270:'GMB',275:'PSE',276:'DEU',288:'GHA',
  296:'KIR',300:'GRC',304:'GRL',308:'GRD',316:'GUM',320:'GTM',324:'GIN',328:'GUY',
  332:'HTI',336:'VAT',340:'HND',344:'HKG',348:'HUN',352:'ISL',356:'IND',360:'IDN',
  364:'IRN',368:'IRQ',372:'IRL',376:'ISR',380:'ITA',384:'CIV',388:'JAM',392:'JPN',
  398:'KAZ',400:'JOR',404:'KEN',408:'PRK',410:'KOR',414:'KWT',417:'KGZ',418:'LAO',
  422:'LBN',426:'LSO',428:'LVA',430:'LBR',434:'LBY',438:'LIE',440:'LTU',442:'LUX',
  446:'MAC',450:'MDG',454:'MWI',458:'MYS',462:'MDV',466:'MLI',470:'MLT',478:'MRT',
  480:'MUS',484:'MEX',492:'MCO',496:'MNG',498:'MDA',499:'MNE',504:'MAR',508:'MOZ',
  512:'OMN',516:'NAM',520:'NRU',524:'NPL',528:'NLD',
  531:'CUW',533:'ABW',534:'SXM',540:'NCL',548:'VUT',554:'NZL',558:'NIC',562:'NER',
  566:'NGA',570:'NIU',578:'NOR',580:'MNP',583:'FSM',584:'MHL',585:'PLW',586:'PAK',
  591:'PAN',598:'PNG',600:'PRY',604:'PER',608:'PHL',616:'POL',620:'PRT',624:'GNB',
  626:'TLS',630:'PRI',
  634:'QAT',642:'ROU',643:'RUS',646:'RWA',659:'KNA',662:'LCA',670:'VCT',678:'STP',
  682:'SAU',686:'SEN',688:'SRB',690:'SYC',694:'SLE',702:'SGP',703:'SVK',704:'VNM',
  705:'SVN',706:'SOM',710:'ZAF',716:'ZWE',724:'ESP',728:'SSD',729:'SDN',732:'ESH',
  740:'SUR',748:'SWZ',752:'SWE',756:'CHE',760:'SYR',762:'TJK',764:'THA',768:'TGO',
  776:'TON',780:'TTO',784:'ARE',788:'TUN',792:'TUR',795:'TKM',796:'TCA',798:'TUV',
  800:'UGA',804:'UKR',807:'MKD',818:'EGY',826:'GBR',831:'GGY',832:'JEY',833:'IMN',
  834:'TZA',840:'USA',850:'VIR',854:'BFA',858:'URY',860:'UZB',862:'VEN',876:'WLF',
  882:'WSM',887:'YEM',894:'ZMB',
}

function buildIso3Map(world) {
  const map = {}
  if (!world.objects?.countries?.geometries) return map
  world.objects.countries.geometries.forEach((g) => {
    if (g.id !== undefined) map[g.id] = ISO_LOOKUP[parseInt(g.id)] || null
  })
  return map
}
