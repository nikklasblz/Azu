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
      case 'G': this.buf.cursor.col = Math.min(p0, this.buf.cols - 1); break
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
