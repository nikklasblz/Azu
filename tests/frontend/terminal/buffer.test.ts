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
