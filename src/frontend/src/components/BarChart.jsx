import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useTheme } from '../ThemeContext.jsx'

export default function BarChart({ data, valueKey = 'value', labelKey = 'entity', colorScale, selectedCode, onSelect, width = 340, height = 420 }) {
  const { colors: C } = useTheme()
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return
    const margin = { top: 8, right: 80, bottom: 8, left: 8 }
    const W = width - margin.left - margin.right
    const H = height - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d[valueKey])]).range([0, W])
    const y = d3.scaleBand().domain(data.map((d) => d[labelKey])).range([0, H]).padding(0.18)

    const isSelected = (d) => selectedCode && d.code === selectedCode

    g.selectAll('.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (d) => y(d[labelKey]))
      .attr('width', (d) => x(d[valueKey]))
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', (d) => isSelected(d) ? C.accent : (colorScale ? colorScale(d[valueKey]) : '#1c6ea4'))
      .attr('stroke', (d) => isSelected(d) ? '#ffffff' : 'none')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseover', function(_, d) {
        d3.select(this)
          .style('filter', 'brightness(1.7)')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.5)
        // Highlight matching label
        g.selectAll('.label')
          .filter((ld) => ld[labelKey] === d[labelKey])
          .attr('fill', '#e0e6f0')
          .attr('font-weight', 'bold')
      })
      .on('mouseout', function(_, d) {
        d3.select(this)
          .style('filter', null)
          .attr('stroke', isSelected(d) ? '#ffffff' : 'none')
          .attr('stroke-width', isSelected(d) ? 1 : 0)
        g.selectAll('.label')
          .filter((ld) => ld[labelKey] === d[labelKey])
          .attr('fill', isSelected(d) ? '#e0e6f0' : '#8899bb')
          .attr('font-weight', 'normal')
      })
      .on('click', (_, d) => onSelect && onSelect(d))

    g.selectAll('.label')
      .data(data)
      .join('text')
      .attr('class', 'label')
      .attr('x', (d) => x(d[valueKey]) + 4)
      .attr('y', (d) => y(d[labelKey]) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', (d) => isSelected(d) ? C.textPrimary : C.textSecondary)
      .attr('font-size', 10)
      .attr('pointer-events', 'none')
      .text((d) => `${d[labelKey]} (${d[valueKey].toFixed(1)})`)
  }, [data, selectedCode, width, height, C])

  return <svg ref={svgRef} width={width} height={height} />
}
