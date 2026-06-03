import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useTheme } from '../ThemeContext.jsx'

export default function LineChart({ data, title, width = 400, height = 200 }) {
  const { colors: C } = useTheme()
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length < 2) return
    const margin = { top: 24, right: 20, bottom: 32, left: 44 }
    const W = width - margin.left - margin.right
    const H = height - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.year)).range([0, W])
    const y = d3.scaleLinear().domain([0, 100]).range([H, 0])

    g.append('g').attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')))
      .call((ax) => { ax.select('.domain').attr('stroke', C.border); ax.selectAll('text').attr('fill', C.textMuted).attr('font-size', 10) })

    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .call((ax) => { ax.select('.domain').attr('stroke', C.border); ax.selectAll('text').attr('fill', C.textMuted).attr('font-size', 10) })

    const line = d3.line().x((d) => x(d.year)).y((d) => y(d.value)).curve(d3.curveMonotoneX)

    g.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 2).attr('d', line)

    g.selectAll('.dot').data(data).join('circle')
      .attr('class', 'dot').attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.value))
      .attr('r', 3).attr('fill', C.accent)

    if (title) {
      svg.append('text').attr('x', margin.left).attr('y', 14)
        .attr('fill', C.textSecondary).attr('font-size', 11).text(title)
    }
  }, [data, width, height, title, C])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
