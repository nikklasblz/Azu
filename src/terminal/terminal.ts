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
