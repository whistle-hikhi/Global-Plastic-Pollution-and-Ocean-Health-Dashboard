import React, { createContext, useContext, useState, useEffect } from 'react'
import { DARK, LIGHT, cssVars } from './theme.js'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true)
  const colors = isDark ? DARK : LIGHT

  useEffect(() => {
    const el = document.documentElement
    el.style.cssText = cssVars(colors)
    document.body.style.background = colors.bg
    document.body.style.color = colors.textPrimary
    document.body.style.transition = 'background 0.3s, color 0.3s'
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(d => !d), colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
