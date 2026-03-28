import { createStore } from 'solid-js/store'
import { azuDark, azuLight, tokyoNight, dracula, nord, sunriseGold, midnightGold, roseQuartz, emberGlow } from '../themes'

export interface ThemeColors {
  surface: string; surfaceAlt: string; border: string
  text: string; textMuted: string; accent: string
  success: string; warning: string; error: string
  terminalBg: string; terminalFg: string; terminalCursor: string; terminalSelection: string
}

export interface ThemeDefinition {
  id: string; name: string; colors: ThemeColors
}

interface ThemeState {
  activeId: string
  themes: Record<string, ThemeDefinition>
  bgAlpha: number
}

const builtInThemes: ThemeDefinition[] = [azuDark, azuLight, tokyoNight, dracula, nord, sunriseGold, midnightGold, roseQuartz, emberGlow]
const themesMap: Record<string, ThemeDefinition> = {}
for (const t of builtInThemes) { themesMap[t.id] = t }

const [themeStore, setThemeStore] = createStore<ThemeState>({
  activeId: 'azu-dark',
  themes: themesMap,
  bgAlpha: 1,
})

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Apply bgAlpha to any hex background color. Text colors stay opaque. */
export function bgColor(hex: string): string {
  if (themeStore.bgAlpha >= 1) return hex
  return hexToRgba(hex, themeStore.bgAlpha)
}

export function setBgAlpha(alpha: number) {
  setThemeStore('bgAlpha', alpha)
  // Re-apply theme to update CSS variables with new alpha
  applyTheme(themeStore.activeId)
}

export function applyTheme(id: string) {
  const theme = themeStore.themes[id]
  if (!theme) return
  setThemeStore('activeId', id)
  // In browser, set CSS variables. In test env (jsdom), document.documentElement may not have style
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--azu-surface', bgColor(theme.colors.surface))
    root.style.setProperty('--azu-surface-alt', bgColor(theme.colors.surfaceAlt))
    root.style.setProperty('--azu-border', theme.colors.border)
    root.style.setProperty('--azu-text', theme.colors.text)
    root.style.setProperty('--azu-text-muted', theme.colors.textMuted)
    root.style.setProperty('--azu-accent', theme.colors.accent)
    root.style.setProperty('--azu-success', theme.colors.success)
    root.style.setProperty('--azu-warning', theme.colors.warning)
    root.style.setProperty('--azu-error', theme.colors.error)
    root.style.setProperty('--azu-terminal-bg', bgColor(theme.colors.terminalBg))
    root.style.setProperty('--azu-terminal-fg', theme.colors.terminalFg)
    root.style.setProperty('--azu-terminal-cursor', theme.colors.terminalCursor)
    root.style.setProperty('--azu-terminal-selection', theme.colors.terminalSelection)
  }
}

export function getAvailableThemes(): ThemeDefinition[] {
  return Object.values(themeStore.themes)
}

export function registerTheme(theme: ThemeDefinition) {
  setThemeStore('themes', theme.id, theme)
}

export { themeStore }
