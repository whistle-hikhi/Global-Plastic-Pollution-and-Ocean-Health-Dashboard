import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useTheme } from '../ThemeContext.jsx'

export default function RadarChart({ data, width = 300, height = 300 }) {
  const { colors: C } = useTheme()
  const svgRef = useRef()

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
        .text(d.goal)
    })
  }, [data, width, height, C])

  return <svg ref={svgRef} width={width} height={height} />
}
