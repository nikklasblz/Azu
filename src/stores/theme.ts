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
}

const builtInThemes: ThemeDefinition[] = [azuDark, azuLight, tokyoNight, dracula, nord, sunriseGold, midnightGold, roseQuartz, emberGlow]
const themesMap: Record<string, ThemeDefinition> = {}
for (const t of builtInThemes) { themesMap[t.id] = t }

const [themeStore, setThemeStore] = createStore<ThemeState>({
  activeId: 'azu-dark',
  themes: themesMap,
})

export function applyTheme(id: string) {
  const theme = themeStore.themes[id]
  if (!theme) return
  setThemeStore('activeId', id)
  // In browser, set CSS variables. In test env (jsdom), document.documentElement may not have style
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--azu-surface', theme.colors.surface)
    root.style.setProperty('--azu-surface-alt', theme.colors.surfaceAlt)
    root.style.setProperty('--azu-border', theme.colors.border)
    root.style.setProperty('--azu-text', theme.colors.text)
    root.style.setProperty('--azu-text-muted', theme.colors.textMuted)
    root.style.setProperty('--azu-accent', theme.colors.accent)
    root.style.setProperty('--azu-success', theme.colors.success)
    root.style.setProperty('--azu-warning', theme.colors.warning)
    root.style.setProperty('--azu-error', theme.colors.error)
    root.style.setProperty('--azu-terminal-bg', theme.colors.terminalBg)
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
