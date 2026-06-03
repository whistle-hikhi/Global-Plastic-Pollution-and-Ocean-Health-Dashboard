import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import { useTheme } from '../ThemeContext.jsx'

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'

let _topoCache = null
async function getWorld() {
  if (!_topoCache) _topoCache = await fetch(TOPO_URL).then((r) => r.json())
  return _topoCache
}

export default function WorldChoropleth({ data, colorScale, valueFormat, onCountryClick, selectedCode, width = 760, height = 400 }) {
  const { colors: C } = useTheme()
  const svgRef = useRef()
  const zoomRef = useRef()
  const gRef = useRef()
  const pathRef = useRef()
  const iso3MapRef = useRef({})
  const featuresRef = useRef([])
  const [tooltip, setTooltip] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [notOnMap, setNotOnMap] = useState(false)

  const valueMap = React.useMemo(() => {
    const m = {}
    if (data) data.forEach((d) => { m[d.code] = d })
    return m
  }, [data])

  // Build map once, attach zoom — re-run when theme changes
  useEffect(() => {
    if (!data) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const projection = d3.geoNaturalEarth1().fitSize([width, height], { type: 'Sphere' })
    const path = d3.geoPath(projection)
    pathRef.current = path

    const g = svg.append('g')
    gRef.current = g

    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .translateExtent([[0, 0], [width, height]])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        const k = event.transform.k
        setZoomLevel(k)
        // Keep highlighted border visually consistent at all zoom levels
        g.selectAll('.country')
          .attr('stroke-width', (f) => {
            const code = iso3MapRef.current[f.id]
            return selectedCode && code === selectedCode ? 2 / k : 0.4 / k
          })
      })
    zoomRef.current = zoom
    svg.call(zoom)
    // Disable double-click zoom (we use it for country selection feel)
    svg.on('dblclick.zoom', null)

    getWorld().then((world) => {
      const countries = topojson.feature(world, world.objects.countries)
      iso3MapRef.current = buildIso3Map(world)
      featuresRef.current = countries.features

      g.append('path')
        .datum({ type: 'Sphere' })
        .attr('d', path)
        .attr('fill', C.mapOcean)

      g.selectAll('.country')
        .data(countries.features)
        .join('path')
        .attr('class', 'country')
        .attr('d', path)
        .attr('fill', (f) => {
          const code = iso3MapRef.current[f.id]
          const row = code ? valueMap[code] : null
          return row ? colorScale(row.value) : C.mapLand
        })
        .attr('stroke', (f) => {
          const code = iso3MapRef.current[f.id]
          return selectedCode && code === selectedCode ? C.accent : C.mapBorder
        })
        .attr('stroke-width', 0.4)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, f) {
          const code = iso3MapRef.current[f.id]
          if (!code) return
          d3.select(this)
            .raise()
            .style('filter', 'brightness(1.8) drop-shadow(0 0 4px rgba(0,180,216,0.6))')
            .attr('stroke', '#00b4d8')
            .attr('stroke-width', 2 / (d3.zoomTransform(svgRef.current).k || 1))
        })
        .on('mousemove', (event, f) => {
          const code = iso3MapRef.current[f.id]
          const row = code ? valueMap[code] : null
          if (row) {
            setTooltip({ x: event.clientX, y: event.clientY, content: `${row.entity}\n${valueFormat ? valueFormat(row.value) : row.value.toFixed(2)}` })
          }
        })
        .on('mouseout', function(_, f) {
          setTooltip(null)
          const code = iso3MapRef.current[f.id]
          const isSel = code && code === selectedCode
          d3.select(this)
            .style('filter', null)
            .attr('stroke', isSel ? '#00b4d8' : '#0a1628')
            .attr('stroke-width', isSel ? 2 / (d3.zoomTransform(svgRef.current).k || 1) : 0.4 / (d3.zoomTransform(svgRef.current).k || 1))
        })
        .on('click', (_, f) => {
          const code = iso3MapRef.current[f.id]
          const row = code ? valueMap[code] : null
          if (row && onCountryClick) onCountryClick(row)
        })
    })
  }, [data, colorScale, width, height, C])

  // Update stroke when selection changes
  useEffect(() => {
    if (!gRef.current) return
    const k = zoomLevel
    gRef.current.selectAll('.country')
      .attr('stroke', (f) => {
        const code = iso3MapRef.current[f.id]
        return selectedCode && code === selectedCode ? '#00b4d8' : '#0a1628'
      })
      .attr('stroke-width', (f) => {
        const code = iso3MapRef.current[f.id]
        return selectedCode && code === selectedCode ? 2 / k : 0.4 / k
      })
  }, [selectedCode])

  // Auto-zoom to selected country
  useEffect(() => {
    if (!selectedCode || !svgRef.current || !zoomRef.current || !pathRef.current) return
    const feature = featuresRef.current.find((f) => iso3MapRef.current[f.id] === selectedCode)
    if (!feature) {
      // Country exists in data but has no geometry in the TopoJSON (e.g. micro-states)
      setNotOnMap(true)
      setTimeout(() => setNotOnMap(false), 3500)
      return
    }
    setNotOnMap(false)

    const bounds = pathRef.current.bounds(feature)
    const [[x0, y0], [x1, y1]] = bounds
    const bw = x1 - x0, bh = y1 - y0
    if (bw === 0 || bh === 0) return

    const padding = 40
    const scale = Math.min(8, 0.9 / Math.max(bw / (width - padding * 2), bh / (height - padding * 2)))
    const tx = width / 2 - scale * (x0 + bw / 2)
    const ty = height / 2 - scale * (y0 + bh / 2)

    d3.select(svgRef.current)
      .transition().duration(750)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }, [selectedCode, width, height])

  const resetZoom = () => {
    d3.select(svgRef.current)
      .transition().duration(500)
      .call(zoomRef.current.transform, d3.zoomIdentity)
  }

  const stepZoom = (factor) => {
    d3.select(svgRef.current)
      .transition().duration(300)
      .call(zoomRef.current.scaleBy, factor)
  }

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block', borderRadius: 8, cursor: 'grab' }}
      />

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        {[
          { label: '+', action: () => stepZoom(1.5) },
          { label: '−', action: () => stepZoom(1 / 1.5) },
          { label: '⟳', action: resetZoom, title: 'Reset view' },
        ].map(({ label, action, title }) => (
          <button
            key={label}
            onClick={action}
            title={title}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: C.headerBg, border: `1px solid ${C.accentBorder}`,
              color: C.accent, fontSize: label === '⟳' ? '0.9rem' : '1.1rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Zoom level badge */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        color: C.textDim, fontSize: '0.72rem',
        background: C.headerBg, padding: '2px 6px', borderRadius: 4,
        border: `1px solid ${C.border}`,
      }}>
        {zoomLevel.toFixed(1)}×
      </div>

      {notOnMap && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: C.headerBg, border: '1px solid rgba(255,180,0,0.4)',
          borderRadius: '8px', padding: '0.4rem 0.9rem', color: '#f0c040',
          fontSize: '0.78rem', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
        }}>
          Country too small to display at this map resolution
        </div>
      )}

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10, zIndex: 999,
          background: C.headerBg, border: `1px solid ${C.accentBorder}`,
          borderRadius: '8px', padding: '0.5rem 0.75rem', color: C.textPrimary,
          fontSize: '0.82rem', pointerEvents: 'none', whiteSpace: 'pre-line',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

function buildIso3Map(world) {
  const map = {}
  if (!world.objects?.countries?.geometries) return map
  world.objects.countries.geometries.forEach((g) => {
    if (g.id !== undefined) map[g.id] = numericToISO3(g.id)
  })
  return map
}

const ISO_LOOKUP = {
  // A
  4:'AFG',8:'ALB',12:'DZA',16:'ASM',20:'AND',24:'AGO',28:'ATG',31:'AZE',32:'ARG',36:'AUS',
  40:'AUT',44:'BHS',48:'BHR',50:'BGD',51:'ARM',52:'BRB',56:'BEL',60:'BMU',64:'BTN',68:'BOL',
  70:'BIH',72:'BWA',76:'BRA',84:'BLZ',86:'IOT',90:'SLB',92:'VGB',96:'BRN',
  // C
  100:'BGR',104:'MMR',108:'BDI',112:'BLR',116:'KHM',120:'CMR',124:'CAN',132:'CPV',
  136:'CYM',140:'CAF',144:'LKA',148:'TCD',152:'CHL',156:'CHN',158:'TWN',170:'COL',
  174:'COM',178:'COG',180:'COD',184:'COK',188:'CRI',191:'HRV',192:'CUB',196:'CYP',
  // D-F
  203:'CZE',204:'BEN',208:'DNK',212:'DMA',214:'DOM',218:'ECU',222:'SLV',226:'GNQ',
  231:'ETH',232:'ERI',233:'EST',234:'FRO',238:'FLK',242:'FJI',246:'FIN',250:'FRA',
  258:'PYF',262:'DJI',266:'GAB',268:'GEO',270:'GMB',275:'PSE',276:'DEU',288:'GHA',
  // G-J
  296:'KIR',300:'GRC',304:'GRL',308:'GRD',316:'GUM',320:'GTM',324:'GIN',328:'GUY',
  332:'HTI',336:'VAT',340:'HND',344:'HKG',348:'HUN',352:'ISL',356:'IND',360:'IDN',
  364:'IRN',368:'IRQ',372:'IRL',376:'ISR',380:'ITA',384:'CIV',388:'JAM',392:'JPN',
  // K-M
  398:'KAZ',400:'JOR',404:'KEN',408:'PRK',410:'KOR',414:'KWT',417:'KGZ',418:'LAO',
  422:'LBN',426:'LSO',428:'LVA',430:'LBR',434:'LBY',438:'LIE',440:'LTU',442:'LUX',
  446:'MAC',450:'MDG',454:'MWI',458:'MYS',462:'MDV',466:'MLI',470:'MLT',478:'MRT',
  480:'MUS',484:'MEX',492:'MCO',496:'MNG',498:'MDA',499:'MNE',504:'MAR',508:'MOZ',
  512:'OMN',516:'NAM',520:'NRU',524:'NPL',528:'NLD',
  // N-P
  531:'CUW',533:'ABW',534:'SXM',540:'NCL',548:'VUT',554:'NZL',558:'NIC',562:'NER',
  566:'NGA',570:'NIU',578:'NOR',580:'MNP',583:'FSM',584:'MHL',585:'PLW',586:'PAK',
  591:'PAN',598:'PNG',600:'PRY',604:'PER',608:'PHL',616:'POL',620:'PRT',624:'GNB',
  626:'TLS',630:'PRI',
  // Q-S
  634:'QAT',642:'ROU',643:'RUS',646:'RWA',659:'KNA',662:'LCA',670:'VCT',678:'STP',
  682:'SAU',686:'SEN',688:'SRB',690:'SYC',694:'SLE',702:'SGP',703:'SVK',704:'VNM',
  705:'SVN',706:'SOM',710:'ZAF',716:'ZWE',724:'ESP',728:'SSD',729:'SDN',732:'ESH',
  740:'SUR',748:'SWZ',752:'SWE',756:'CHE',760:'SYR',762:'TJK',764:'THA',768:'TGO',
  776:'TON',780:'TTO',784:'ARE',788:'TUN',792:'TUR',795:'TKM',796:'TCA',798:'TUV',
  800:'UGA',804:'UKR',807:'MKD',818:'EGY',826:'GBR',831:'GGY',832:'JEY',833:'IMN',
  834:'TZA',840:'USA',850:'VIR',854:'BFA',858:'URY',860:'UZB',862:'VEN',876:'WLF',
  882:'WSM',887:'YEM',894:'ZMB',
}

function numericToISO3(id) {
  return ISO_LOOKUP[parseInt(id)] || null
}
