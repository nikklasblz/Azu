import { ThemeDefinition } from '../stores/theme'
export const dracula: ThemeDefinition = {
  id: 'dracula', name: 'Dracula',
  colors: {
    surface: '#282a36', surfaceAlt: '#343746', border: '#44475a',
    text: '#f8f8f2', textMuted: '#6272a4', accent: '#bd93f9',
    success: '#50fa7b', warning: '#f1fa8c', error: '#ff5555',
    terminalBg: '#282a36', terminalFg: '#f8f8f2', terminalCursor: '#bd93f9',
    terminalSelection: 'rgba(189,147,249,0.3)',
  },
}
