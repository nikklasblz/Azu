import { ThemeDefinition } from '../stores/theme'
export const tokyoNight: ThemeDefinition = {
  id: 'tokyo-night', name: 'Tokyo Night',
  colors: {
    surface: '#1a1b26', surfaceAlt: '#24283b', border: '#3b4261',
    text: '#a9b1d6', textMuted: '#565f89', accent: '#7aa2f7',
    success: '#9ece6a', warning: '#e0af68', error: '#f7768e',
    terminalBg: '#1a1b26', terminalFg: '#a9b1d6', terminalCursor: '#7aa2f7',
    terminalSelection: 'rgba(122,162,247,0.3)',
  },
}
