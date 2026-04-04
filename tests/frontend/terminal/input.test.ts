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
