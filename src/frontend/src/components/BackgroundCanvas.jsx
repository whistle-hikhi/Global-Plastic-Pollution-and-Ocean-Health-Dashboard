import React, { useEffect, useRef } from 'react'
import { useTheme } from '../ThemeContext.jsx'

const PARTICLE_COUNT = 65
const BUBBLE_COUNT = 28

function rnd(a, b) { return a + Math.random() * (b - a) }

function makeParticles(w, h) {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const kind = Math.random()
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: rnd(-0.25, 0.25),
      vy: rnd(-0.12, 0.12),
      size: rnd(3, 12),
      // 0 = microplastic circle, 1 = bag/film rect, 2 = bottle fragment (thin long rect)
      type: kind < 0.5 ? 0 : kind < 0.8 ? 1 : 2,
      rot: Math.random() * Math.PI * 2,
      rotV: rnd(-0.006, 0.006),
      opacity: rnd(0.12, 0.38),
      aspect: rnd(1.2, 3),
      colorIdx: Math.floor(Math.random() * 6),
    }
  })
}

function makeBubbles(w, h) {
  return Array.from({ length: BUBBLE_COUNT }, () => ({
    x: Math.random() * w,
    y: h + Math.random() * 200,
    vy: rnd(-0.25, -0.65),
    r: rnd(1.5, 5),
    wobble: Math.random() * Math.PI * 2,
    wobbleV: rnd(0.018, 0.04),
    opacity: rnd(0.06, 0.18),
  }))
}

const DARK_COLORS  = ['#7cafc8','#9ab4c4','#6d9bb8','#8faec0','#b0c8d8','#5d8eaa']
const LIGHT_COLORS = ['#4488aa','#3377aa','#5599bb','#2266aa','#447799','#336688']

const WAVE_CFG = [
  { speed: 0.28, amp: 22, freq: 0.009,  yFrac: 0.80 },
  { speed: 0.17, amp: 32, freq: 0.006,  yFrac: 0.86 },
  { speed: 0.42, amp: 14, freq: 0.014,  yFrac: 0.91 },
]

export default function BackgroundCanvas() {
  const { isDark } = useTheme()
  const canvasRef = useRef()
  const stateRef = useRef({ p: [], b: [], raf: null })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const state = stateRef.current

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      state.p = makeParticles(canvas.width, canvas.height)
      state.b = makeBubbles(canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    function draw(ts) {
      const w = canvas.width, h = canvas.height
      const t = ts / 1000
      ctx.clearRect(0, 0, w, h)

      // — base fill —
      ctx.fillStyle = isDark ? '#0a1628' : '#f0f5fb'
      ctx.fillRect(0, 0, w, h)

      // — depth gradient —
      const dg = ctx.createLinearGradient(0, 0, 0, h)
      if (isDark) {
        dg.addColorStop(0,   'rgba(0,10,30,0)')
        dg.addColorStop(0.5, 'rgba(0,20,55,0.12)')
        dg.addColorStop(1,   'rgba(0,8,28,0.35)')
      } else {
        dg.addColorStop(0,   'rgba(210,230,248,0)')
        dg.addColorStop(0.6, 'rgba(180,215,240,0.08)')
        dg.addColorStop(1,   'rgba(90,150,200,0.18)')
      }
      ctx.fillStyle = dg
      ctx.fillRect(0, 0, w, h)

      // — sunlight rays (dark mode only) —
      if (isDark) {
        for (let i = 0; i < 6; i++) {
          const cx = w * (0.08 + i * 0.17) + Math.sin(t * 0.08 + i * 1.1) * 25
          const rg = ctx.createLinearGradient(cx, 0, cx + 80, h * 0.65)
          rg.addColorStop(0,   'rgba(30,120,220,0.05)')
          rg.addColorStop(0.6, 'rgba(30,120,220,0.02)')
          rg.addColorStop(1,   'rgba(30,120,220,0)')
          ctx.fillStyle = rg
          ctx.beginPath()
          ctx.moveTo(cx - 15, 0)
          ctx.lineTo(cx + 55, 0)
          ctx.lineTo(cx + 140, h * 0.65)
          ctx.lineTo(cx + 60,  h * 0.65)
          ctx.closePath()
          ctx.fill()
        }
      }

      // — floating plastic particles —
      const colors = isDark ? DARK_COLORS : LIGHT_COLORS
      state.p.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rotV
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = isDark ? p.opacity : p.opacity * 0.65
        ctx.fillStyle = colors[p.colorIdx]

        if (p.type === 0) {
          // microplastic circle
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === 1) {
          // plastic bag / film — wide flat rect
          const rw = p.size * p.aspect, rh = p.size * 0.55
          ctx.fillRect(-rw / 2, -rh / 2, rw, rh)
        } else {
          // bottle fragment — thin tall rect
          const rw = p.size * 0.45, rh = p.size * p.aspect
          ctx.fillRect(-rw / 2, -rh / 2, rw, rh)
        }
        ctx.restore()
      })

      // — rising bubbles —
      state.b.forEach(b => {
        b.y += b.vy
        b.wobble += b.wobbleV
        const bx = b.x + Math.sin(b.wobble) * 4
        if (b.y < -15) { b.y = h + 20; b.x = Math.random() * w }

        ctx.save()
        ctx.globalAlpha = b.opacity
        ctx.beginPath()
        ctx.arc(bx, b.y, b.r, 0, Math.PI * 2)
        ctx.strokeStyle = isDark ? 'rgba(120,200,255,0.55)' : 'rgba(60,140,210,0.35)'
        ctx.lineWidth = 0.8
        ctx.stroke()
        // inner highlight
        ctx.beginPath()
        ctx.arc(bx - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2)
        ctx.fillStyle = isDark ? 'rgba(200,240,255,0.15)' : 'rgba(255,255,255,0.4)'
        ctx.fill()
        ctx.restore()
      })

      // — wave layers at bottom —
      WAVE_CFG.forEach(({ speed, amp, freq, yFrac }, idx) => {
        const baseY = h * yFrac
        const op = isDark ? [0.20, 0.14, 0.09][idx] : [0.13, 0.09, 0.06][idx]
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 5) {
          ctx.lineTo(x, baseY + amp * Math.sin(freq * x + t * speed))
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fillStyle = isDark
          ? `rgba(0,80,160,${op})`
          : `rgba(80,160,220,${op})`
        ctx.fill()
      })

      state.raf = requestAnimationFrame(draw)
    }

    state.raf = requestAnimationFrame(draw)
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(state.raf)
    }
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none',
      }}
    />
  )
}
