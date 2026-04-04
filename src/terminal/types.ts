// A single character cell in the terminal grid
export interface Cell {
  char: string
  fg: number
  bg: number
  fgRGB: string | null
  bgRGB: string | null
  bold: boolean
  italic: boolean
  underline: boolean
  dim: boolean
  inverse: boolean
  hidden: boolean
  strikethrough: boolean
}

export function createEmptyCell(): Cell {
  return {
    char: '',
    fg: -1, bg: -1,
    fgRGB: null, bgRGB: null,
    bold: false, italic: false, underline: false,
    dim: false, inverse: false, hidden: false, strikethrough: false,
  }
}

export function cloneCell(cell: Cell): Cell {
  return { ...cell }
}

export interface CursorState {
  row: number
  col: number
  visible: boolean
}

export interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export const DEFAULT_THEME: TerminalTheme = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  selectionBackground: 'rgba(56,139,253,0.3)',
  black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
  blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39d2c0', white: '#b1bac4',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
  brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
}

export const ANSI_COLORS: (keyof TerminalTheme)[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
]

export function get256Color(index: number, theme: TerminalTheme): string {
  if (index < 16) return theme[ANSI_COLORS[index]] as string
  if (index < 232) {
    const i = index - 16
    const r = Math.floor(i / 36) * 51
    const g = Math.floor((i % 36) / 6) * 51
    const b = (i % 6) * 51
    return `rgb(${r},${g},${b})`
  }
  const g = (index - 232) * 10 + 8
  return `rgb(${g},${g},${g})`
}
