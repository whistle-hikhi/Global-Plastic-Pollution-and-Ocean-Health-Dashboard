import React, { useState, useEffect } from 'react'
import Act1_PlasticWaste from './components/Act1_PlasticWaste.jsx'
import Act2_Rivers from './components/Act2_Rivers.jsx'
import Act3_OceanHealth from './components/Act3_OceanHealth.jsx'
import BackgroundCanvas from './components/BackgroundCanvas.jsx'
import { useTheme } from './ThemeContext.jsx'

const ACTS = [
  { id: 'act1', label: 'Act I — Plastic Origins' },
  { id: 'act2', label: 'Act II — River Pathways' },
  { id: 'act3', label: 'Act III — Ocean Health' },
]

export default function App() {
  const { isDark, toggle, colors: C } = useTheme()
  const [activeAct, setActiveAct] = useState('act1')

  const scrollTo = (id) => {
    setActiveAct(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) setActiveAct(e.target.id) }) },
      { threshold: 0.3 }
    )
    ACTS.forEach(({ id }) => { const el = document.getElementById(id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])

  // Section panels sit on a frosted glass layer so the canvas shows through
  const panelBg = isDark
    ? 'rgba(10,22,40,0.78)'
    : 'rgba(240,245,251,0.82)'

  return (
    <>
      {/* Animated ocean background — fixed, behind everything */}
      <BackgroundCanvas />

      {/* Scrollable content above the canvas */}
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: C.textPrimary }}>

        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: C.headerBg, backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${C.accentBorder}`,
          padding: '0 2rem', display: 'flex', alignItems: 'center', gap: '2rem', height: '56px',
          transition: 'background 0.3s',
        }}>
          <span style={{ color: C.accent, fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            PLASTIC & OCEAN HEALTH
          </span>
          <nav style={{ display: 'flex', gap: '0.25rem' }}>
            {ACTS.map(({ id, label }) => (
              <button key={id} onClick={() => scrollTo(id)} style={{
                background: activeAct === id ? C.accentSoft : 'transparent',
                border: activeAct === id ? `1px solid ${C.accentBorder}` : '1px solid transparent',
                color: activeAct === id ? C.accent : C.textSecondary,
                borderRadius: '6px', padding: '0.3rem 0.8rem',
                cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.2s',
              }}>
                {label}
              </button>
            ))}
          </nav>
          <button onClick={toggle} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              marginLeft: 'auto', width: 36, height: 36, borderRadius: 8,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.textSecondary, cursor: 'pointer', fontSize: '1.1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s', flexShrink: 0,
            }}>
            {isDark ? '☀️' : '🌙'}
          </button>
        </header>

        {/* Hero */}
        <div style={{
          padding: '5rem 2rem 4rem',
          maxWidth: '900px', margin: '0 auto',
        }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800,
            lineHeight: 1.1, color: C.textPrimary, marginBottom: '1rem',
            textShadow: isDark ? '0 2px 20px rgba(0,0,0,0.5)' : '0 2px 12px rgba(0,0,0,0.08)',
          }}>
            The <span style={{ color: C.accent }}>Plastic Crisis</span><br />Reaching Our Oceans
          </h1>
          <p style={{ color: C.textMuted, fontSize: '1.1rem', maxWidth: '600px', lineHeight: 1.6 }}>
            Over 8 million tonnes of plastic enter the ocean every year. Explore where it comes from,
            how it travels, and what it's doing to ocean health worldwide.
          </p>
        </div>

        {/* Act sections — each on a frosted panel */}
        {ACTS.map(({ id }, i) => (
          <section key={id} id={id} style={{ padding: '0 1rem 3rem', maxWidth: '1420px', margin: '0 auto' }}>
            <div style={{
              background: panelBg,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${C.border}`,
              borderRadius: '16px',
              padding: '2.5rem 2rem',
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.35)'
                : '0 4px 24px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.accent, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Act {['I', 'II', 'III'][i]}
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: C.textPrimary, marginBottom: '2rem' }}>
                {['Where Plastic Waste Is Mismanaged', 'The Emission Points That Feed the Ocean', 'Ocean Health at a Glance'][i]}
              </h2>
              {i === 0 && <Act1_PlasticWaste />}
              {i === 1 && <Act2_Rivers />}
              {i === 2 && <Act3_OceanHealth />}
            </div>
          </section>
        ))}

        <div style={{ height: '3rem' }} />
      </div>
    </>
  )
}
