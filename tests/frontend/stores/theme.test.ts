import { describe, it, expect } from 'vitest'
import { themeStore, applyTheme, getAvailableThemes, registerTheme } from '../../../src/stores/theme'

describe('Theme Store', () => {
  it('has azu-dark as default', () => {
    expect(themeStore.activeId).toBe('azu-dark')
  })

  it('lists all built-in themes', () => {
    const themes = getAvailableThemes()
    expect(themes.length).toBeGreaterThanOrEqual(5)
    expect(themes.map(t => t.id)).toContain('azu-dark')
    expect(themes.map(t => t.id)).toContain('azu-light')
  })

  it('applies a theme by id', () => {
    applyTheme('nord')
    expect(themeStore.activeId).toBe('nord')
  })

  it('registers a custom theme', () => {
    registerTheme({
      id: 'custom-test',
      name: 'Custom Test',
      colors: {
        surface: '#111111',
        surfaceAlt: '#222222',
        border: '#333333',
        text: '#eeeeee',
        textMuted: '#999999',
        accent: '#ff0000',
        success: '#00ff00',
        warning: '#ffff00',
        error: '#ff0000',
        terminalBg: '#111111',
        terminalFg: '#eeeeee',
        terminalCursor: '#ff0000',
        terminalSelection: 'rgba(255,0,0,0.3)',
      },
    })
    const themes = getAvailableThemes()
    expect(themes.map(t => t.id)).toContain('custom-test')
  })
})
