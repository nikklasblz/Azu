import { ThemeDefinition } from '../stores/theme'
export const nord: ThemeDefinition = {
  id: 'nord', name: 'Nord',
  colors: {
    surface: '#2e3440', surfaceAlt: '#3b4252', border: '#4c566a',
    text: '#d8dee9', textMuted: '#81a1c1', accent: '#88c0d0',
    success: '#a3be8c', warning: '#ebcb8b', error: '#bf616a',
    terminalBg: '#2e3440', terminalFg: '#d8dee9', terminalCursor: '#88c0d0',
    terminalSelection: 'rgba(136,192,208,0.3)',
  },
}
