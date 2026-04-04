// TerminalPool — manages terminal instances with VANILLA DOM
// Completely bypasses SolidJS to avoid reactivity-driven destruction
// Terminals are created once and positioned over grid cell slots

import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { listen } from '@tauri-apps/api/event'
import { pty, clipboard } from '../../lib/tauri-commands'

interface PoolEntry {
  ptyId: string
  cellId: string
  term: XTerm
  fitAddon: FitAddon
  wrapper: HTMLDivElement
  resizeObs: ResizeObserver
}

const pool = new Map<string, PoolEntry>()
let poolContainer: HTMLElement | null = null
let gridContainer: HTMLElement | null = null
let positionRaf: number | null = null

export function initPool(poolEl: HTMLElement, gridEl: HTMLElement) {
  poolContainer = poolEl
  gridContainer = gridEl

  // Global resize handler
  window.addEventListener('resize', updateAllPositions)

  // Watch for grid DOM changes to reposition terminals
  const observer = new MutationObserver(() => schedulePositionUpdate())
  observer.observe(gridEl, { childList: true, subtree: true, attributes: true })
}

function schedulePositionUpdate() {
  if (positionRaf) return
  positionRaf = requestAnimationFrame(() => {
    updateAllPositions()
    positionRaf = null
  })
}

function updateAllPositions() {
  if (!gridContainer) return
  const containerRect = gridContainer.getBoundingClientRect()

  for (const entry of pool.values()) {
    const slot = gridContainer.querySelector(`[data-cell-id="${entry.cellId}"]`) as HTMLElement
    if (!slot) continue
    const slotRect = slot.getBoundingClientRect()
    entry.wrapper.style.left = `${slotRect.left - containerRect.left}px`
    entry.wrapper.style.top = `${slotRect.top - containerRect.top}px`
    entry.wrapper.style.width = `${slotRect.width}px`
    entry.wrapper.style.height = `${slotRect.height}px`
    entry.fitAddon.fit()
  }
}

export function createTerminal(ptyId: string, cellId: string) {
  if (pool.has(ptyId) || !poolContainer) return

  // Create wrapper div with vanilla DOM
  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.zIndex = '1'
  wrapper.style.overflow = 'hidden'
  poolContainer.appendChild(wrapper)

  // Create xterm
  const term = new XTerm({
    cursorBlink: true,
    fontSize: 14,
    allowTransparency: true,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
  })

  const fitAddon = new FitAddon()
  const searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.open(wrapper)

  // Position over grid slot
  const resizeObs = new ResizeObserver(() => {
    fitAddon.fit()
    const dims = fitAddon.proposeDimensions()
    if (dims) pty.resize(ptyId, dims.rows, dims.cols)
  })
  resizeObs.observe(wrapper)

  const entry: PoolEntry = { ptyId, cellId, term, fitAddon, wrapper, resizeObs }
  pool.set(ptyId, entry)

  // Initial position
  requestAnimationFrame(() => {
    updateAllPositions()
    fitAddon.fit()
    term.focus()
  })

  // PTY output
  listen<string>(`pty-output-${ptyId}`, (event) => {
    term.write(event.payload)
  })

  // PTY exit
  listen<number>(`pty-exit-${ptyId}`, (event) => {
    const code = event.payload
    term.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
  })

  // Keyboard input → PTY
  term.onData((data) => {
    pty.write(ptyId, data)
  })

  // Keyboard shortcuts
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true
    if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'w')) return false
    if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'V')) return false

    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      term.options.fontSize = Math.min((term.options.fontSize || 14) + 1, 32)
      fitAddon.fit()
      return false
    }
    if (e.ctrlKey && e.key === '-') {
      term.options.fontSize = Math.max((term.options.fontSize || 14) - 1, 8)
      fitAddon.fit()
      return false
    }
    if (e.ctrlKey && e.key === '0') {
      term.options.fontSize = 14
      fitAddon.fit()
      return false
    }

    if (e.ctrlKey && e.key === 'c') {
      const selection = term.getSelection()
      if (selection) {
        clipboard.writeText(selection)
        return false
      }
    }

    if (e.ctrlKey && e.key === 'v') {
      clipboard.saveImageToFile().then((path) => {
        if (path) pty.write(ptyId, path)
      }).catch(() => {})
      return true
    }

    return true
  })
}

export function removeTerminal(ptyId: string) {
  const entry = pool.get(ptyId)
  if (!entry) return
  entry.resizeObs.disconnect()
  entry.term.dispose()
  entry.wrapper.remove()
  pool.delete(ptyId)
}

export function updateCellId(ptyId: string, cellId: string) {
  const entry = pool.get(ptyId)
  if (entry) {
    entry.cellId = cellId
    schedulePositionUpdate()
  }
}

// Force reposition all terminals (call after grid split/resize)
export { updateAllPositions, schedulePositionUpdate }
