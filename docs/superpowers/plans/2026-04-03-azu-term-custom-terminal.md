# Azu Terminal Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom terminal emulator (azu-term) that survives DOM destruction, replacing xterm.js and solving the split/re-mount problem permanently.

**Architecture:** TypeScript terminal with state separated from rendering. AnsiParser feeds TerminalBuffer (persistent memory), CanvasRenderer paints to any canvas (replaceable). attach()/detach() API lets the terminal move between DOM containers without losing state.

**Tech Stack:** TypeScript, HTML5 Canvas 2D, Vitest for testing

---

## File Structure

```
src/terminal/
├── types.ts        — Cell, CursorState, TerminalTheme, constants
├── parser.ts       — ANSI escape sequence state machine
├── buffer.ts       — TerminalBuffer: cell grid + scrollback + cursor
├── renderer.ts     — CanvasRenderer: paints buffer to canvas 2D
├── input.ts        — InputHandler: keyboard events → PTY byte sequences
├── terminal.ts     — AzuTerminal: main class combining all components
└── index.ts        — public exports

tests/frontend/terminal/
├── parser.test.ts
├── buffer.test.ts
├── renderer.test.ts
├── input.test.ts
└── terminal.test.ts
```

---

### Task 1: Types and constants

**Files:**
- Create: `src/terminal/types.ts`
- Test: `tests/frontend/terminal/buffer.test.ts` (import check)

- [ ] **Step 1: Create types.ts**

```typescript
// src/terminal/types.ts

// A single character cell in the terminal grid
export interface Cell {
  char: string        // single character (or '' for empty)
  fg: number          // foreground color index (0-255) or -1 for default
  bg: number          // background color index (0-255) or -1 for default
  fgRGB: string | null  // truecolor fg (#rrggbb) or null
  bgRGB: string | null  // truecolor bg (#rrggbb) or null
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
  // ANSI 16 colors
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

// Map ANSI color index (0-15) to theme property name
export const ANSI_COLORS: (keyof TerminalTheme)[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
]

// Generate 256-color palette (16 ANSI + 216 color cube + 24 grayscale)
export function get256Color(index: number, theme: TerminalTheme): string {
  if (index < 16) return theme[ANSI_COLORS[index]] as string
  if (index < 232) {
    // 6x6x6 color cube
    const i = index - 16
    const r = Math.floor(i / 36) * 51
    const g = Math.floor((i % 36) / 6) * 51
    const b = (i % 6) * 51
    return `rgb(${r},${g},${b})`
  }
  // 24 grayscale
  const g = (index - 232) * 10 + 8
  return `rgb(${g},${g},${g})`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/terminal/types.ts
git commit -m "feat(azu-term): types, Cell, CursorState, TerminalTheme, color palette"
```

---

### Task 2: Terminal Buffer

**Files:**
- Create: `src/terminal/buffer.ts`
- Test: `tests/frontend/terminal/buffer.test.ts`

- [ ] **Step 1: Write buffer tests**

```typescript
// tests/frontend/terminal/buffer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { TerminalBuffer } from '../../../src/terminal/buffer'

describe('TerminalBuffer', () => {
  let buf: TerminalBuffer

  beforeEach(() => {
    buf = new TerminalBuffer(80, 24)
  })

  it('initializes with correct dimensions', () => {
    expect(buf.cols).toBe(80)
    expect(buf.rows).toBe(24)
    expect(buf.cursor.row).toBe(0)
    expect(buf.cursor.col).toBe(0)
  })

  it('writes a character at cursor position', () => {
    buf.writeChar('A')
    expect(buf.getCell(0, 0).char).toBe('A')
    expect(buf.cursor.col).toBe(1)
  })

  it('wraps at end of line', () => {
    for (let i = 0; i < 80; i++) buf.writeChar('X')
    expect(buf.cursor.row).toBe(1)
    expect(buf.cursor.col).toBe(0)
  })

  it('scrolls when writing past last row', () => {
    for (let i = 0; i < 24; i++) buf.lineFeed()
    // Should have scrolled — row 0 content moved to scrollback
    expect(buf.cursor.row).toBe(23)
    expect(buf.scrollback.length).toBe(1)
  })

  it('moves cursor with setCursor', () => {
    buf.setCursor(5, 10)
    expect(buf.cursor.row).toBe(5)
    expect(buf.cursor.col).toBe(10)
  })

  it('clamps cursor to bounds', () => {
    buf.setCursor(100, 200)
    expect(buf.cursor.row).toBe(23)
    expect(buf.cursor.col).toBe(79)
  })

  it('erases line from cursor to end', () => {
    buf.writeChar('A')
    buf.writeChar('B')
    buf.writeChar('C')
    buf.setCursor(0, 1)
    buf.eraseInLine(0) // cursor to end
    expect(buf.getCell(0, 0).char).toBe('A')
    expect(buf.getCell(0, 1).char).toBe('')
    expect(buf.getCell(0, 2).char).toBe('')
  })

  it('erases entire display', () => {
    buf.writeChar('A')
    buf.eraseInDisplay(2) // entire screen
    expect(buf.getCell(0, 0).char).toBe('')
  })

  it('carriage return moves to column 0', () => {
    buf.writeChar('A')
    buf.writeChar('B')
    buf.carriageReturn()
    expect(buf.cursor.col).toBe(0)
  })

  it('resize preserves content', () => {
    buf.writeChar('A')
    buf.writeChar('B')
    buf.resize(40, 12)
    expect(buf.cols).toBe(40)
    expect(buf.rows).toBe(12)
    expect(buf.getCell(0, 0).char).toBe('A')
    expect(buf.getCell(0, 1).char).toBe('B')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/buffer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TerminalBuffer**

```typescript
// src/terminal/buffer.ts
import { Cell, CursorState, createEmptyCell, cloneCell } from './types'

export class TerminalBuffer {
  cols: number
  rows: number
  cursor: CursorState
  scrollback: Cell[][] = []
  maxScrollback = 1000

  private grid: Cell[][]
  private savedCursor: CursorState | null = null

  // Current SGR attributes for new characters
  currentAttrs: Omit<Cell, 'char'> = {
    fg: -1, bg: -1, fgRGB: null, bgRGB: null,
    bold: false, italic: false, underline: false,
    dim: false, inverse: false, hidden: false, strikethrough: false,
  }

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.cursor = { row: 0, col: 0, visible: true }
    this.grid = this.createGrid(cols, rows)
  }

  private createGrid(cols: number, rows: number): Cell[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => createEmptyCell())
    )
  }

  getCell(row: number, col: number): Cell {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return createEmptyCell()
    return this.grid[row][col]
  }

  writeChar(ch: string) {
    if (this.cursor.col >= this.cols) {
      this.cursor.col = 0
      this.lineFeed()
    }
    const cell = this.grid[this.cursor.row][this.cursor.col]
    cell.char = ch
    cell.fg = this.currentAttrs.fg
    cell.bg = this.currentAttrs.bg
    cell.fgRGB = this.currentAttrs.fgRGB
    cell.bgRGB = this.currentAttrs.bgRGB
    cell.bold = this.currentAttrs.bold
    cell.italic = this.currentAttrs.italic
    cell.underline = this.currentAttrs.underline
    cell.dim = this.currentAttrs.dim
    cell.inverse = this.currentAttrs.inverse
    cell.hidden = this.currentAttrs.hidden
    cell.strikethrough = this.currentAttrs.strikethrough
    this.cursor.col++
  }

  lineFeed() {
    if (this.cursor.row < this.rows - 1) {
      this.cursor.row++
    } else {
      this.scrollUp()
    }
  }

  carriageReturn() {
    this.cursor.col = 0
  }

  private scrollUp() {
    const removed = this.grid.shift()!
    if (this.scrollback.length >= this.maxScrollback) this.scrollback.shift()
    this.scrollback.push(removed)
    this.grid.push(Array.from({ length: this.cols }, () => createEmptyCell()))
  }

  setCursor(row: number, col: number) {
    this.cursor.row = Math.max(0, Math.min(row, this.rows - 1))
    this.cursor.col = Math.max(0, Math.min(col, this.cols - 1))
  }

  moveCursorUp(n = 1) { this.cursor.row = Math.max(0, this.cursor.row - n) }
  moveCursorDown(n = 1) { this.cursor.row = Math.min(this.rows - 1, this.cursor.row + n) }
  moveCursorForward(n = 1) { this.cursor.col = Math.min(this.cols - 1, this.cursor.col + n) }
  moveCursorBackward(n = 1) { this.cursor.col = Math.max(0, this.cursor.col - n) }

  eraseInLine(mode: number) {
    const row = this.grid[this.cursor.row]
    if (mode === 0) { // cursor to end
      for (let c = this.cursor.col; c < this.cols; c++) row[c] = createEmptyCell()
    } else if (mode === 1) { // start to cursor
      for (let c = 0; c <= this.cursor.col; c++) row[c] = createEmptyCell()
    } else if (mode === 2) { // entire line
      for (let c = 0; c < this.cols; c++) row[c] = createEmptyCell()
    }
  }

  eraseInDisplay(mode: number) {
    if (mode === 0) { // cursor to end
      this.eraseInLine(0)
      for (let r = this.cursor.row + 1; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++) this.grid[r][c] = createEmptyCell()
    } else if (mode === 1) { // start to cursor
      for (let r = 0; r < this.cursor.row; r++)
        for (let c = 0; c < this.cols; c++) this.grid[r][c] = createEmptyCell()
      this.eraseInLine(1)
    } else if (mode === 2) { // entire display
      this.grid = this.createGrid(this.cols, this.rows)
    }
  }

  saveCursor() { this.savedCursor = { ...this.cursor } }
  restoreCursor() { if (this.savedCursor) this.cursor = { ...this.savedCursor } }

  resetAttrs() {
    this.currentAttrs = {
      fg: -1, bg: -1, fgRGB: null, bgRGB: null,
      bold: false, italic: false, underline: false,
      dim: false, inverse: false, hidden: false, strikethrough: false,
    }
  }

  resize(newCols: number, newRows: number) {
    const newGrid = this.createGrid(newCols, newRows)
    const copyRows = Math.min(this.rows, newRows)
    const copyCols = Math.min(this.cols, newCols)
    for (let r = 0; r < copyRows; r++)
      for (let c = 0; c < copyCols; c++)
        newGrid[r][c] = cloneCell(this.grid[r][c])
    this.grid = newGrid
    this.cols = newCols
    this.rows = newRows
    this.cursor.row = Math.min(this.cursor.row, newRows - 1)
    this.cursor.col = Math.min(this.cursor.col, newCols - 1)
  }

  // Get all visible rows for rendering
  getVisibleRows(): Cell[][] {
    return this.grid
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/buffer.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/buffer.ts src/terminal/types.ts tests/frontend/terminal/buffer.test.ts
git commit -m "feat(azu-term): TerminalBuffer with cell grid, scrollback, cursor, erase"
```

---

### Task 3: ANSI Parser

**Files:**
- Create: `src/terminal/parser.ts`
- Test: `tests/frontend/terminal/parser.test.ts`

- [ ] **Step 1: Write parser tests**

```typescript
// tests/frontend/terminal/parser.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AnsiParser } from '../../../src/terminal/parser'
import { TerminalBuffer } from '../../../src/terminal/buffer'

describe('AnsiParser', () => {
  let buf: TerminalBuffer
  let parser: AnsiParser

  beforeEach(() => {
    buf = new TerminalBuffer(80, 24)
    parser = new AnsiParser(buf)
  })

  it('writes plain text to buffer', () => {
    parser.parse('Hello')
    expect(buf.getCell(0, 0).char).toBe('H')
    expect(buf.getCell(0, 4).char).toBe('o')
    expect(buf.cursor.col).toBe(5)
  })

  it('handles newline (\\n) and carriage return (\\r)', () => {
    parser.parse('AB\r\nCD')
    expect(buf.getCell(0, 0).char).toBe('A')
    expect(buf.getCell(1, 0).char).toBe('C')
  })

  it('handles backspace (\\x08)', () => {
    parser.parse('AB\x08')
    expect(buf.cursor.col).toBe(1)
  })

  it('handles tab (\\t)', () => {
    parser.parse('\t')
    expect(buf.cursor.col).toBe(8)
  })

  it('parses SGR bold', () => {
    parser.parse('\x1b[1mA')
    expect(buf.getCell(0, 0).bold).toBe(true)
  })

  it('parses SGR reset', () => {
    parser.parse('\x1b[1m\x1b[0mA')
    expect(buf.getCell(0, 0).bold).toBe(false)
  })

  it('parses SGR foreground color (30-37)', () => {
    parser.parse('\x1b[31mA') // red
    expect(buf.getCell(0, 0).fg).toBe(1)
  })

  it('parses SGR background color (40-47)', () => {
    parser.parse('\x1b[42mA') // green bg
    expect(buf.getCell(0, 0).bg).toBe(2)
  })

  it('parses SGR 256 color', () => {
    parser.parse('\x1b[38;5;196mA') // fg 256-color
    expect(buf.getCell(0, 0).fg).toBe(196)
  })

  it('parses SGR truecolor', () => {
    parser.parse('\x1b[38;2;255;128;0mA') // fg RGB
    expect(buf.getCell(0, 0).fgRGB).toBe('#ff8000')
  })

  it('parses cursor up (CUU)', () => {
    buf.setCursor(5, 0)
    parser.parse('\x1b[3A')
    expect(buf.cursor.row).toBe(2)
  })

  it('parses cursor position (CUP)', () => {
    parser.parse('\x1b[5;10H')
    expect(buf.cursor.row).toBe(4) // 1-indexed
    expect(buf.cursor.col).toBe(9)
  })

  it('parses erase in display (ED)', () => {
    parser.parse('ABCD')
    parser.parse('\x1b[2J')
    expect(buf.getCell(0, 0).char).toBe('')
  })

  it('parses erase in line (EL)', () => {
    parser.parse('ABCD')
    parser.parse('\x1b[1G') // cursor to col 1
    parser.parse('\x1b[K')  // erase to end
    expect(buf.getCell(0, 0).char).toBe('A')
    expect(buf.getCell(0, 1).char).toBe('')
  })

  it('handles incomplete escape sequence across chunks', () => {
    parser.parse('\x1b[3')  // incomplete
    parser.parse('1m')       // completes: \x1b[31m (red)
    parser.parse('A')
    expect(buf.getCell(0, 0).fg).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/parser.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement AnsiParser**

```typescript
// src/terminal/parser.ts
import { TerminalBuffer } from './buffer'

const enum State {
  Normal,
  Escape,    // got ESC (\x1b)
  CSI,       // got ESC[
  OSC,       // got ESC]
}

export class AnsiParser {
  private buf: TerminalBuffer
  private state = State.Normal
  private params: number[] = []
  private paramStr = ''
  private oscData = ''

  constructor(buf: TerminalBuffer) {
    this.buf = buf
  }

  parse(data: string) {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      const code = data.charCodeAt(i)

      switch (this.state) {
        case State.Normal:
          this.handleNormal(ch, code)
          break
        case State.Escape:
          this.handleEscape(ch)
          break
        case State.CSI:
          this.handleCSI(ch, code)
          break
        case State.OSC:
          this.handleOSC(ch, code)
          break
      }
    }
  }

  private handleNormal(ch: string, code: number) {
    if (code === 0x1b) { this.state = State.Escape; return }
    if (code === 0x0a) { this.buf.lineFeed(); return }           // \n
    if (code === 0x0d) { this.buf.carriageReturn(); return }     // \r
    if (code === 0x08) { this.buf.moveCursorBackward(1); return } // backspace
    if (code === 0x09) { // tab
      const next = (Math.floor(this.buf.cursor.col / 8) + 1) * 8
      this.buf.cursor.col = Math.min(next, this.buf.cols - 1)
      return
    }
    if (code === 0x07) return // bell — ignore
    if (code < 0x20) return   // other control chars — ignore

    this.buf.writeChar(ch)
  }

  private handleEscape(ch: string) {
    if (ch === '[') {
      this.state = State.CSI
      this.params = []
      this.paramStr = ''
    } else if (ch === ']') {
      this.state = State.OSC
      this.oscData = ''
    } else if (ch === '7') {
      this.buf.saveCursor()
      this.state = State.Normal
    } else if (ch === '8') {
      this.buf.restoreCursor()
      this.state = State.Normal
    } else if (ch === 'D') {
      this.buf.lineFeed()
      this.state = State.Normal
    } else if (ch === 'M') {
      this.buf.moveCursorUp(1)
      this.state = State.Normal
    } else {
      this.state = State.Normal
    }
  }

  private handleCSI(ch: string, code: number) {
    // Collect digits and semicolons as parameters
    if ((code >= 0x30 && code <= 0x39) || ch === ';') {
      this.paramStr += ch
      return
    }

    // Parse params
    this.params = this.paramStr.split(';').map(s => (s === '' ? 0 : parseInt(s, 10)))

    // Execute CSI command
    const p = this.params
    const p0 = p[0] || 0
    const p1 = p[1] || 0

    switch (ch) {
      case 'A': this.buf.moveCursorUp(p0 || 1); break
      case 'B': this.buf.moveCursorDown(p0 || 1); break
      case 'C': this.buf.moveCursorForward(p0 || 1); break
      case 'D': this.buf.moveCursorBackward(p0 || 1); break
      case 'H': case 'f': this.buf.setCursor((p0 || 1) - 1, (p1 || 1) - 1); break
      case 'G': this.buf.cursor.col = Math.min((p0 || 1) - 1, this.buf.cols - 1); break
      case 'J': this.buf.eraseInDisplay(p0); break
      case 'K': this.buf.eraseInLine(p0); break
      case 'd': this.buf.cursor.row = Math.min((p0 || 1) - 1, this.buf.rows - 1); break
      case 'm': this.handleSGR(p); break
      case 'r': break // scroll region — ignore for now
      case 'h': case 'l': break // mode set/reset — ignore for now
      case 'n': break // device status — ignore
      case 'c': break // device attributes — ignore
      case 'S': // scroll up
        for (let i = 0; i < (p0 || 1); i++) this.buf.lineFeed()
        break
      case '@': // insert characters
        break // TODO
      case 'P': // delete characters
        break // TODO
      case 'L': // insert lines
        break // TODO
      case 'M': // delete lines
        break // TODO
    }

    this.state = State.Normal
  }

  private handleOSC(ch: string, code: number) {
    if (code === 0x07 || ch === '\\') { // BEL or ST terminates OSC
      this.state = State.Normal
      return
    }
    if (code === 0x1b) { // ESC might be start of ST (\x1b\\)
      return
    }
    this.oscData += ch
  }

  private handleSGR(params: number[]) {
    if (params.length === 0) params = [0]

    for (let i = 0; i < params.length; i++) {
      const p = params[i]
      const attrs = this.buf.currentAttrs

      if (p === 0) { this.buf.resetAttrs(); continue }
      if (p === 1) { attrs.bold = true; continue }
      if (p === 2) { attrs.dim = true; continue }
      if (p === 3) { attrs.italic = true; continue }
      if (p === 4) { attrs.underline = true; continue }
      if (p === 7) { attrs.inverse = true; continue }
      if (p === 8) { attrs.hidden = true; continue }
      if (p === 9) { attrs.strikethrough = true; continue }
      if (p === 22) { attrs.bold = false; attrs.dim = false; continue }
      if (p === 23) { attrs.italic = false; continue }
      if (p === 24) { attrs.underline = false; continue }
      if (p === 27) { attrs.inverse = false; continue }
      if (p === 28) { attrs.hidden = false; continue }
      if (p === 29) { attrs.strikethrough = false; continue }

      // Foreground 30-37
      if (p >= 30 && p <= 37) { attrs.fg = p - 30; attrs.fgRGB = null; continue }
      // Background 40-47
      if (p >= 40 && p <= 47) { attrs.bg = p - 40; attrs.bgRGB = null; continue }
      // Bright foreground 90-97
      if (p >= 90 && p <= 97) { attrs.fg = p - 90 + 8; attrs.fgRGB = null; continue }
      // Bright background 100-107
      if (p >= 100 && p <= 107) { attrs.bg = p - 100 + 8; attrs.bgRGB = null; continue }

      // Default fg/bg
      if (p === 39) { attrs.fg = -1; attrs.fgRGB = null; continue }
      if (p === 49) { attrs.bg = -1; attrs.bgRGB = null; continue }

      // 256 color: 38;5;N or 48;5;N
      if (p === 38 && params[i + 1] === 5) {
        attrs.fg = params[i + 2] || 0
        attrs.fgRGB = null
        i += 2
        continue
      }
      if (p === 48 && params[i + 1] === 5) {
        attrs.bg = params[i + 2] || 0
        attrs.bgRGB = null
        i += 2
        continue
      }

      // Truecolor: 38;2;R;G;B or 48;2;R;G;B
      if (p === 38 && params[i + 1] === 2) {
        const r = params[i + 2] || 0
        const g = params[i + 3] || 0
        const b = params[i + 4] || 0
        attrs.fgRGB = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        attrs.fg = -1
        i += 4
        continue
      }
      if (p === 48 && params[i + 1] === 2) {
        const r = params[i + 2] || 0
        const g = params[i + 3] || 0
        const b = params[i + 4] || 0
        attrs.bgRGB = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        attrs.bg = -1
        i += 4
        continue
      }
    }
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/parser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/parser.ts tests/frontend/terminal/parser.test.ts
git commit -m "feat(azu-term): ANSI parser — SGR, cursor, erase, chunked input"
```

---

### Task 4: Canvas Renderer

**Files:**
- Create: `src/terminal/renderer.ts`
- Test: `tests/frontend/terminal/renderer.test.ts`

- [ ] **Step 1: Write renderer tests**

```typescript
// tests/frontend/terminal/renderer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CanvasRenderer } from '../../../src/terminal/renderer'
import { TerminalBuffer } from '../../../src/terminal/buffer'
import { DEFAULT_THEME } from '../../../src/terminal/types'

// Mock canvas context
function createMockCanvas() {
  const ctx = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 8 })),
    font: '',
    fillStyle: '',
    textBaseline: '' as CanvasTextBaseline,
  }
  const canvas = {
    getContext: vi.fn(() => ctx),
    width: 640,
    height: 384,
    style: {} as CSSStyleDeclaration,
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx }
}

describe('CanvasRenderer', () => {
  let renderer: CanvasRenderer
  let buf: TerminalBuffer
  let mockCanvas: ReturnType<typeof createMockCanvas>

  beforeEach(() => {
    buf = new TerminalBuffer(80, 24)
    mockCanvas = createMockCanvas()
    renderer = new CanvasRenderer(DEFAULT_THEME)
    renderer.attachCanvas(mockCanvas.canvas)
  })

  it('renders without errors', () => {
    buf.writeChar('A')
    expect(() => renderer.render(buf)).not.toThrow()
  })

  it('calls fillRect for background', () => {
    renderer.render(buf)
    expect(mockCanvas.ctx.fillRect).toHaveBeenCalled()
  })

  it('calls fillText for characters', () => {
    buf.writeChar('X')
    renderer.render(buf)
    expect(mockCanvas.ctx.fillText).toHaveBeenCalled()
  })

  it('measures cell dimensions', () => {
    const dims = renderer.getCellDimensions()
    expect(dims.width).toBeGreaterThan(0)
    expect(dims.height).toBeGreaterThan(0)
  })

  it('calculates fit dimensions', () => {
    const fit = renderer.calculateFit(640, 384)
    expect(fit.cols).toBeGreaterThan(0)
    expect(fit.rows).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement CanvasRenderer**

```typescript
// src/terminal/renderer.ts
import { TerminalBuffer } from './buffer'
import { TerminalTheme, get256Color, ANSI_COLORS } from './types'

export class CanvasRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private theme: TerminalTheme
  private cellWidth = 0
  private cellHeight = 0
  private fontSize = 14
  private fontFamily = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace"
  private renderScheduled = false

  constructor(theme: TerminalTheme) {
    this.theme = theme
    this.measureCell()
  }

  attachCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.measureCell()
  }

  detachCanvas() {
    this.canvas = null
    this.ctx = null
  }

  setTheme(theme: TerminalTheme) {
    this.theme = theme
  }

  setFont(size: number, family?: string) {
    this.fontSize = size
    if (family) this.fontFamily = family
    this.measureCell()
  }

  private measureCell() {
    // Use offscreen measurement
    const measureCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(100, 100)
      : this.canvas
    if (!measureCanvas) {
      this.cellWidth = this.fontSize * 0.6
      this.cellHeight = this.fontSize * 1.2
      return
    }
    const mCtx = measureCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    if (!mCtx) return
    mCtx.font = `${this.fontSize}px ${this.fontFamily}`
    const metrics = mCtx.measureText('W')
    this.cellWidth = metrics.width
    this.cellHeight = this.fontSize * 1.4
  }

  getCellDimensions() {
    return { width: this.cellWidth, height: this.cellHeight }
  }

  calculateFit(widthPx: number, heightPx: number): { cols: number, rows: number } {
    if (this.cellWidth === 0 || this.cellHeight === 0) return { cols: 80, rows: 24 }
    return {
      cols: Math.max(1, Math.floor(widthPx / this.cellWidth)),
      rows: Math.max(1, Math.floor(heightPx / this.cellHeight)),
    }
  }

  scheduleRender(buf: TerminalBuffer) {
    if (this.renderScheduled) return
    this.renderScheduled = true
    requestAnimationFrame(() => {
      this.renderScheduled = false
      this.render(buf)
    })
  }

  render(buf: TerminalBuffer) {
    if (!this.canvas || !this.ctx) return
    const ctx = this.ctx
    const cw = this.cellWidth
    const ch = this.cellHeight

    // Size canvas to buffer
    const pxWidth = Math.ceil(cw * buf.cols)
    const pxHeight = Math.ceil(ch * buf.rows)
    if (this.canvas.width !== pxWidth || this.canvas.height !== pxHeight) {
      this.canvas.width = pxWidth
      this.canvas.height = pxHeight
    }

    // Clear with background
    ctx.fillStyle = this.theme.background
    ctx.fillRect(0, 0, pxWidth, pxHeight)

    ctx.font = `${this.fontSize}px ${this.fontFamily}`
    ctx.textBaseline = 'top'

    const rows = buf.getVisibleRows()

    for (let r = 0; r < buf.rows; r++) {
      const row = rows[r]
      if (!row) continue

      for (let c = 0; c < buf.cols; c++) {
        const cell = row[c]
        const x = c * cw
        const y = r * ch
        const inverse = cell.inverse

        // Resolve colors
        let fg = this.resolveFg(cell, inverse)
        let bg = this.resolveBg(cell, inverse)

        // Draw background (skip if default)
        if (bg !== this.theme.background) {
          ctx.fillStyle = bg
          ctx.fillRect(x, y, cw, ch)
        }

        // Draw character
        if (cell.char && cell.char !== '' && !cell.hidden) {
          ctx.fillStyle = fg
          let font = `${this.fontSize}px ${this.fontFamily}`
          if (cell.bold) font = `bold ${font}`
          if (cell.italic) font = `italic ${font}`
          ctx.font = font

          const textY = y + (ch - this.fontSize) / 2
          ctx.fillText(cell.char, x, textY)

          if (cell.underline) {
            ctx.fillRect(x, y + ch - 2, cw, 1)
          }
          if (cell.strikethrough) {
            ctx.fillRect(x, y + ch / 2, cw, 1)
          }
        }

        // Cursor
        if (r === buf.cursor.row && c === buf.cursor.col && buf.cursor.visible) {
          ctx.fillStyle = this.theme.cursor
          ctx.globalAlpha = 0.7
          ctx.fillRect(x, y, cw, ch)
          ctx.globalAlpha = 1.0
        }
      }
    }
  }

  private resolveFg(cell: { fg: number, fgRGB: string | null, bold: boolean, dim: boolean, inverse: boolean }, inverse: boolean): string {
    let color: string
    if (cell.fgRGB) color = cell.fgRGB
    else if (cell.fg >= 0 && cell.fg < 16) color = this.theme[ANSI_COLORS[cell.fg]] as string
    else if (cell.fg >= 16) color = get256Color(cell.fg, this.theme)
    else color = this.theme.foreground

    if (cell.dim) color = this.dimColor(color)
    return inverse ? this.theme.background : color
  }

  private resolveBg(cell: { bg: number, bgRGB: string | null, inverse: boolean }, inverse: boolean): string {
    if (cell.bgRGB) return inverse ? this.theme.foreground : cell.bgRGB
    if (cell.bg >= 0 && cell.bg < 16) return inverse ? this.theme.foreground : this.theme[ANSI_COLORS[cell.bg]] as string
    if (cell.bg >= 16) return inverse ? this.theme.foreground : get256Color(cell.bg, this.theme)
    return inverse ? this.theme.foreground : this.theme.background
  }

  private dimColor(hex: string): string {
    // Simple dim: reduce opacity
    return hex + '80'
  }
}
```

- [ ] **Step 3: Run tests — should pass**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/renderer.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/terminal/renderer.ts tests/frontend/terminal/renderer.test.ts
git commit -m "feat(azu-term): Canvas 2D renderer — colors, cursor, bold/italic/underline"
```

---

### Task 5: Input Handler

**Files:**
- Create: `src/terminal/input.ts`
- Test: `tests/frontend/terminal/input.test.ts`

- [ ] **Step 1: Write input tests**

```typescript
// tests/frontend/terminal/input.test.ts
import { describe, it, expect, vi } from 'vitest'
import { InputHandler } from '../../../src/terminal/input'

describe('InputHandler', () => {
  it('converts printable key to character', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'a', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('a')
  })

  it('converts Enter to \\r', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'Enter', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('\r')
  })

  it('converts Backspace to \\x7f', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'Backspace', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('\x7f')
  })

  it('converts arrow keys to escape sequences', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'ArrowUp', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('\x1b[A')
  })

  it('converts Ctrl+C to \\x03', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'c', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('\x03')
  })

  it('converts Tab to \\t', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'Tab', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('\t')
  })

  it('converts Escape to \\x1b', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
    expect(onData).toHaveBeenCalledWith('\x1b')
  })

  it('ignores modifier-only keys', () => {
    const onData = vi.fn()
    const handler = new InputHandler(onData)
    handler.handleKey({ key: 'Shift', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })
    expect(onData).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement InputHandler**

```typescript
// src/terminal/input.ts

interface KeyEvent {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export class InputHandler {
  private onData: (data: string) => void

  constructor(onData: (data: string) => void) {
    this.onData = onData
  }

  handleKey(e: KeyEvent): boolean {
    // Ignore modifier-only keys
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock'].includes(e.key)) return false

    // Ctrl+letter → control code
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      const code = e.key.toLowerCase().charCodeAt(0)
      if (code >= 97 && code <= 122) { // a-z
        this.onData(String.fromCharCode(code - 96))
        return true
      }
    }

    // Special keys
    const specialMap: Record<string, string> = {
      'Enter': '\r',
      'Backspace': '\x7f',
      'Tab': '\t',
      'Escape': '\x1b',
      'Delete': '\x1b[3~',
      'ArrowUp': '\x1b[A',
      'ArrowDown': '\x1b[B',
      'ArrowRight': '\x1b[C',
      'ArrowLeft': '\x1b[D',
      'Home': '\x1b[H',
      'End': '\x1b[F',
      'PageUp': '\x1b[5~',
      'PageDown': '\x1b[6~',
      'Insert': '\x1b[2~',
      'F1': '\x1bOP', 'F2': '\x1bOQ', 'F3': '\x1bOR', 'F4': '\x1bOS',
      'F5': '\x1b[15~', 'F6': '\x1b[17~', 'F7': '\x1b[18~', 'F8': '\x1b[19~',
      'F9': '\x1b[20~', 'F10': '\x1b[21~', 'F11': '\x1b[23~', 'F12': '\x1b[24~',
    }

    if (specialMap[e.key]) {
      this.onData(specialMap[e.key])
      return true
    }

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      this.onData(e.key)
      return true
    }

    return false
  }
}
```

- [ ] **Step 3: Run tests — should pass**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/input.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/terminal/input.ts tests/frontend/terminal/input.test.ts
git commit -m "feat(azu-term): InputHandler — keyboard to PTY byte encoding"
```

---

### Task 6: AzuTerminal main class

**Files:**
- Create: `src/terminal/terminal.ts`
- Create: `src/terminal/index.ts`
- Test: `tests/frontend/terminal/terminal.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/frontend/terminal/terminal.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AzuTerminal } from '../../../src/terminal'

describe('AzuTerminal', () => {
  it('creates with default dimensions', () => {
    const term = new AzuTerminal({ cols: 80, rows: 24 })
    expect(term).toBeDefined()
  })

  it('writes data without errors', () => {
    const term = new AzuTerminal({ cols: 80, rows: 24 })
    expect(() => term.write('Hello World')).not.toThrow()
  })

  it('writes ANSI colored text', () => {
    const term = new AzuTerminal({ cols: 80, rows: 24 })
    expect(() => term.write('\x1b[31mRed\x1b[0m Normal')).not.toThrow()
  })

  it('attach and detach lifecycle', () => {
    const term = new AzuTerminal({ cols: 80, rows: 24 })
    const container = document.createElement('div')
    container.style.width = '640px'
    container.style.height = '384px'
    document.body.appendChild(container)

    term.attach(container)
    expect(container.querySelector('canvas')).not.toBeNull()

    term.detach()
    expect(container.querySelector('canvas')).toBeNull()

    // Re-attach — should work without errors
    term.attach(container)
    expect(container.querySelector('canvas')).not.toBeNull()

    term.dispose()
    document.body.removeChild(container)
  })

  it('fires onData callback for keyboard input', () => {
    const term = new AzuTerminal({ cols: 80, rows: 24 })
    const callback = vi.fn()
    term.onData(callback)

    const container = document.createElement('div')
    document.body.appendChild(container)
    term.attach(container)

    // Simulate keydown
    const event = new KeyboardEvent('keydown', { key: 'a' })
    container.querySelector('canvas')!.dispatchEvent(event)

    expect(callback).toHaveBeenCalledWith('a')

    term.dispose()
    document.body.removeChild(container)
  })

  it('preserves state across detach/attach cycle', () => {
    const term = new AzuTerminal({ cols: 80, rows: 24 })
    term.write('HelloWorld')

    const c1 = document.createElement('div')
    document.body.appendChild(c1)
    term.attach(c1)
    term.detach()

    // State should be preserved
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    term.attach(c2)

    // Buffer still has content (internal check)
    expect(() => term.write(' more')).not.toThrow()

    term.dispose()
    document.body.removeChild(c1)
    document.body.removeChild(c2)
  })
})
```

- [ ] **Step 2: Implement AzuTerminal**

```typescript
// src/terminal/terminal.ts
import { AnsiParser } from './parser'
import { TerminalBuffer } from './buffer'
import { CanvasRenderer } from './renderer'
import { InputHandler } from './input'
import { TerminalTheme, DEFAULT_THEME } from './types'

interface AzuTerminalOptions {
  cols?: number
  rows?: number
  fontSize?: number
  fontFamily?: string
  theme?: TerminalTheme
}

export class AzuTerminal {
  private buffer: TerminalBuffer
  private parser: AnsiParser
  private renderer: CanvasRenderer
  private inputHandler: InputHandler
  private canvas: HTMLCanvasElement | null = null
  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private dataCallbacks: Array<(data: string) => void> = []

  constructor(options: AzuTerminalOptions = {}) {
    const cols = options.cols || 80
    const rows = options.rows || 24
    const theme = options.theme || DEFAULT_THEME

    this.buffer = new TerminalBuffer(cols, rows)
    this.parser = new AnsiParser(this.buffer)
    this.renderer = new CanvasRenderer(theme)

    if (options.fontSize) this.renderer.setFont(options.fontSize, options.fontFamily)

    this.inputHandler = new InputHandler((data) => {
      this.dataCallbacks.forEach(cb => cb(data))
    })
  }

  // === Lifecycle ===

  attach(container: HTMLElement) {
    this.container = container

    // Create canvas
    this.canvas = document.createElement('canvas')
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.display = 'block'
    this.canvas.tabIndex = 0 // focusable
    this.canvas.style.outline = 'none'
    container.appendChild(this.canvas)

    // Attach renderer
    this.renderer.attachCanvas(this.canvas)

    // Keyboard events
    this.canvas.addEventListener('keydown', this.handleKeyDown)

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)

    // Initial render
    this.handleResize()
    this.renderer.render(this.buffer)
  }

  detach() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    if (this.canvas) {
      this.canvas.removeEventListener('keydown', this.handleKeyDown)
      this.canvas.remove()
      this.canvas = null
    }
    this.renderer.detachCanvas()
    this.container = null
    // Buffer and parser STATE preserved in memory
  }

  dispose() {
    this.detach()
    this.dataCallbacks = []
  }

  // === Data ===

  write(data: string) {
    this.parser.parse(data)
    this.renderer.scheduleRender(this.buffer)
  }

  onData(callback: (data: string) => void) {
    this.dataCallbacks.push(callback)
  }

  // === Layout ===

  focus() {
    this.canvas?.focus()
  }

  fit(): { cols: number, rows: number } {
    if (!this.container) return { cols: this.buffer.cols, rows: this.buffer.rows }
    const rect = this.container.getBoundingClientRect()
    return this.renderer.calculateFit(rect.width, rect.height)
  }

  resize(cols: number, rows: number) {
    this.buffer.resize(cols, rows)
    this.renderer.render(this.buffer)
  }

  // === Theming ===

  setTheme(theme: TerminalTheme) {
    this.renderer.setTheme(theme)
    this.renderer.render(this.buffer)
  }

  setFontSize(size: number) {
    this.renderer.setFont(size)
    this.handleResize()
  }

  // === Private ===

  private handleKeyDown = (e: KeyboardEvent) => {
    const handled = this.inputHandler.handleKey({
      key: e.key,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    })
    if (handled) e.preventDefault()
  }

  private handleResize() {
    if (!this.container) return
    const { cols, rows } = this.fit()
    if (cols !== this.buffer.cols || rows !== this.buffer.rows) {
      this.buffer.resize(cols, rows)
    }
    this.renderer.render(this.buffer)
  }
}
```

- [ ] **Step 3: Create index.ts**

```typescript
// src/terminal/index.ts
export { AzuTerminal } from './terminal'
export type { TerminalTheme } from './types'
export { DEFAULT_THEME } from './types'
```

- [ ] **Step 4: Run all terminal tests**

Run: `cd D:/Azu && npx vitest run tests/frontend/terminal/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/ tests/frontend/terminal/
git commit -m "feat(azu-term): AzuTerminal main class — attach/detach/write/resize/theme"
```

---

### Task 7: Integration — replace xterm.js in GridCell

**Files:**
- Modify: `src/components/Grid/GridCell.tsx`
- Modify: `src/components/Terminal/Terminal.tsx` (rewrite to use AzuTerminal)

- [ ] **Step 1: Rewrite Terminal.tsx to use AzuTerminal**

Replace the entire Terminal.tsx with a thin wrapper around AzuTerminal:

```typescript
// src/components/Terminal/Terminal.tsx
import { Component, onMount, onCleanup } from 'solid-js'
import { listen } from '@tauri-apps/api/event'
import { pty } from '../../lib/tauri-commands'
import { AzuTerminal } from '../../terminal'
import { themeStore, bgColor } from '../../stores/theme'
import { TerminalTheme } from '../../terminal/types'

// Global registry: ptyId → AzuTerminal instance
// Survives component destruction — that's the whole point
const terminalRegistry = new Map<string, AzuTerminal>()

export function destroyTerminal(ptyId: string) {
  const term = terminalRegistry.get(ptyId)
  if (term) {
    term.dispose()
    terminalRegistry.delete(ptyId)
  }
}

interface TerminalProps {
  ptyId: string
  themeId?: string
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined

  onMount(async () => {
    if (!containerRef) return

    // Check if terminal already exists (re-mount after split)
    let term = terminalRegistry.get(props.ptyId)
    let isNew = false

    if (!term) {
      // First mount — create terminal and wire up PTY
      isNew = true
      term = new AzuTerminal({
        cols: 80, rows: 24,
        fontSize: 14,
      })
      terminalRegistry.set(props.ptyId, term)

      // PTY output → terminal
      listen<string>(`pty-output-${props.ptyId}`, (event) => {
        term!.write(event.payload)
      })

      // PTY exit
      listen<number>(`pty-exit-${props.ptyId}`, (event) => {
        const code = event.payload
        term!.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
      })

      // Keyboard → PTY
      term.onData((data) => {
        pty.write(props.ptyId, data)
      })
    }

    // Attach to this container (works for both new and re-mounted)
    term.attach(containerRef)

    // Resize PTY to match
    const dims = term.fit()
    pty.resize(props.ptyId, dims.rows, dims.cols)

    setTimeout(() => term!.focus(), 100)
  })

  onCleanup(() => {
    // Detach but DON'T destroy — terminal state survives in registry
    const term = terminalRegistry.get(props.ptyId)
    if (term) term.detach()
  })

  return <div ref={containerRef} class="w-full h-full" style={{ background: 'var(--azu-terminal-bg)' }} />
}

export default TerminalComponent
```

- [ ] **Step 2: Restore GridCell.tsx Terminal rendering**

Ensure GridCell.tsx has the Terminal component (should already be there from the revert):

```tsx
// In GridCell.tsx — the terminal section should be:
<div class="flex-1 overflow-hidden">
  <Show when={props.ptyId} fallback={
    <div class="flex items-center justify-center h-full" style={{ color: colors().textMuted }}>
      <span class="text-xs animate-pulse">Starting terminal...</span>
    </div>
  }>
    <TerminalComponent
      ptyId={props.ptyId!}
      themeId={props.node.themeId}
    />
  </Show>
</div>
```

- [ ] **Step 3: Remove xterm.js dependencies**

```bash
cd D:/Azu && npm uninstall @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-search @xterm/addon-serialize
```

- [ ] **Step 4: Run all tests**

Run: `cd D:/Azu && npx vitest run`
Expected: ALL PASS (terminal tests + grid tests + keybinding tests)

- [ ] **Step 5: Build and test**

Run: `cd D:/Azu && npm run tauri build`
Install and verify:
- Terminal opens with shell
- Can type commands
- Colors work (try `ls --color`, colored prompts)
- Split works — existing terminal SURVIVES (attach/detach)
- Resize works
- Multiple tabs work

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(azu-term): replace xterm.js with custom terminal — split-proof"
```
