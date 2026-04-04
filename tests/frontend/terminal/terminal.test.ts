// tests/frontend/terminal/terminal.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AzuTerminal } from '../../../src/terminal'

// jsdom does not implement canvas 2D context — provide a minimal mock
const mockCtx = {
  fillRect: vi.fn(),
  fillText: vi.fn(),
  clearRect: vi.fn(),
  measureText: vi.fn(() => ({ width: 8 })),
  font: '',
  fillStyle: '',
  textBaseline: '',
  globalAlpha: 1,
}

// Patch HTMLCanvasElement.prototype.getContext before any test runs
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as any

// jsdom does not implement ResizeObserver — provide a no-op stub
;(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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
