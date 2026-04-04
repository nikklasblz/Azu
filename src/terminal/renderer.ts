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
