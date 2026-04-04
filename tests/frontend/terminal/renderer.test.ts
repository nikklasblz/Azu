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
