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
    if (this.cursor.col >= this.cols) {
      this.cursor.col = 0
      this.lineFeed()
    }
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
