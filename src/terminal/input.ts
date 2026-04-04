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
