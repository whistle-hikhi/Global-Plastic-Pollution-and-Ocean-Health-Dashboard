import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useTheme } from '../ThemeContext.jsx'

export default function RadarChart({ data, width = 300, height = 300 }) {
  const { colors: C } = useTheme()
  const svgRef = useRef()
  const wrapRef = useRef()
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    if (!data || data.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const cx = width / 2, cy = height / 2
    const r = Math.min(cx, cy) - 40
    const n = data.length
    const angleStep = (2 * Math.PI) / n
    const scale = d3.scaleLinear().domain([0, 100]).range([0, r])

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    ;[20, 40, 60, 80, 100].forEach((v) => {
      const pr = scale(v)
      const pts = data.map((_, i) => {
        const a = i * angleStep - Math.PI / 2
        return [pr * Math.cos(a), pr * Math.sin(a)]
      })
      g.append('polygon')
        .attr('points', pts.map((p) => p.join(',')).join(' '))
        .attr('fill', 'none').attr('stroke', C.border).attr('stroke-width', 0.8)
    })

    data.forEach((_, i) => {
      const a = i * angleStep - Math.PI / 2
      g.append('line').attr('x1', 0).attr('y1', 0).attr('x2', r * Math.cos(a)).attr('y2', r * Math.sin(a))
        .attr('stroke', C.border).attr('stroke-width', 0.8)
    })

    const pts = data.map((d, i) => {
      const a = i * angleStep - Math.PI / 2
      const rv = scale(Math.min(d.value || 0, 100))
      return [rv * Math.cos(a), rv * Math.sin(a)]
    })
    g.append('polygon')
      .attr('points', pts.map((p) => p.join(',')).join(' '))
      .attr('fill', C.accentSoft).attr('stroke', C.accent).attr('stroke-width', 1.5)

    data.forEach((d, i) => {
      const a = i * angleStep - Math.PI / 2
      const labelR = r + 18
      const lx = labelR * Math.cos(a), ly = labelR * Math.sin(a)
      g.append('text').attr('x', lx).attr('y', ly)
        .attr('text-anchor', lx > 5 ? 'start' : lx < -5 ? 'end' : 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', C.textSecondary).attr('font-size', 9)
        .attr('cursor', d.long_goal ? 'default' : 'auto')
        .text(d.goal)
        .on('mouseenter', function (event) {
          if (!d.long_goal) return
          d3.select(this).attr('fill', C.accent).attr('font-weight', 'bold')
          const rect = wrapRef.current?.getBoundingClientRect()
          const ex = event.clientX - (rect?.left ?? 0)
          const ey = event.clientY - (rect?.top ?? 0)
          setTooltip({ x: ex, y: ey, goal: d.goal, long_goal: d.long_goal, value: d.value })
        })
        .on('mousemove', function (event) {
          if (!d.long_goal) return
          const rect = wrapRef.current?.getBoundingClientRect()
          const ex = event.clientX - (rect?.left ?? 0)
          const ey = event.clientY - (rect?.top ?? 0)
          setTooltip((prev) => prev ? { ...prev, x: ex, y: ey } : prev)
        })
        .on('mouseleave', function () {
          d3.select(this).attr('fill', C.textSecondary).attr('font-weight', null)
          setTooltip(null)
        })
    })
  }, [data, width, height, C])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <svg ref={svgRef} width={width} height={height} />
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 10,
          top: tooltip.y - 28,
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.78)',
          color: '#fff',
          borderRadius: 6,
          padding: '4px 9px',
          fontSize: '0.72rem',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          zIndex: 100,
        }}>
          <strong style={{ fontSize: '0.75rem' }}>{tooltip.goal}</strong>
          {' — '}
          {tooltip.long_goal}
          {tooltip.value != null && (
            <span style={{ marginLeft: 8, opacity: 0.8 }}>({tooltip.value.toFixed(1)})</span>
          )}
        </div>
      )}
    </div>
  )
}
