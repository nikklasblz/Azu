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
