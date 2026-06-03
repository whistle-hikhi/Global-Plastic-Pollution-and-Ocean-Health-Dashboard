import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useTheme } from '../ThemeContext.jsx'

export default function LineChart({ data, forecast, title, width = 400, height = 200 }) {
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

    const allYears = [
      ...data.map((d) => d.year),
      ...(forecast || []).map((d) => d.year),
    ]
    const allValues = [
      ...data.map((d) => d.value),
      ...(forecast || []).flatMap((d) => [d.value, d.lower, d.upper]),
    ]
    const x = d3.scaleLinear().domain(d3.extent(allYears)).range([0, W])
    const y = d3.scaleLinear().domain([Math.max(0, d3.min(allValues) - 5), Math.min(100, d3.max(allValues) + 5)]).range([H, 0])

    g.append('g').attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(Math.min(allYears.length, 8)).tickFormat(d3.format('d')))
      .call((ax) => { ax.select('.domain').attr('stroke', C.border); ax.selectAll('text').attr('fill', C.textMuted).attr('font-size', 10) })

    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .call((ax) => { ax.select('.domain').attr('stroke', C.border); ax.selectAll('text').attr('fill', C.textMuted).attr('font-size', 10) })

    // Grid lines
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
      .call((ax) => { ax.select('.domain').remove(); ax.selectAll('line').attr('stroke', C.border).attr('stroke-opacity', 0.4) })

    const line = d3.line().x((d) => x(d.year)).y((d) => y(d.value)).curve(d3.curveMonotoneX)

    // Historical line
    g.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 2).attr('d', line)
    g.selectAll('.dot').data(data).join('circle')
      .attr('class', 'dot').attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.value))
      .attr('r', 2.5).attr('fill', C.accent)

    // Forecast overlay
    if (forecast && forecast.length > 0) {
      // Connector from last history point to first forecast point
      const connector = [data[data.length - 1], forecast[0]]
      g.append('path').datum(connector)
        .attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 3').attr('d', line)

      // CI band
      const area = d3.area()
        .x((d) => x(d.year)).y0((d) => y(d.lower)).y1((d) => y(d.upper))
        .curve(d3.curveMonotoneX)
      g.append('path').datum(forecast)
        .attr('fill', C.accent).attr('fill-opacity', 0.12).attr('d', area)

      // Forecast dashed line
      g.append('path').datum(forecast)
        .attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4').attr('d', line)

      // Forecast dots
      g.selectAll('.fc-dot').data(forecast).join('circle')
        .attr('class', 'fc-dot').attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.value))
        .attr('r', 3).attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 1.5)

      // "Forecast" label at the first point
      g.append('text')
        .attr('x', x(forecast[0].year) + 4).attr('y', y(forecast[0].value) - 8)
        .attr('fill', C.accent).attr('font-size', 9).attr('opacity', 0.8)
        .text('forecast →')
    }

    if (title) {
      svg.append('text').attr('x', margin.left).attr('y', 14)
        .attr('fill', C.textSecondary).attr('font-size', 11).text(title)
    }
  }, [data, forecast, width, height, title, C])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
