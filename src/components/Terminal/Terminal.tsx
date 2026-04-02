import { Component, onMount, onCleanup, createEffect, createSignal } from 'solid-js'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { listen } from '@tauri-apps/api/event'
import { pty, clipboard } from '../../lib/tauri-commands'
import { themeStore, bgColor } from '../../stores/theme'

// Cache terminal instances by ptyId so splits don't destroy/recreate them
const terminalCache = new Map<string, {
  term: XTerm
  fitAddon: FitAddon
  searchAddon: SearchAddon
  cleanupListeners: Array<() => void>
}>()

// Permanently destroy a terminal (when tab/pane is closed, not just re-rendered)
export function destroyTerminal(ptyId: string) {
  const cached = terminalCache.get(ptyId)
  if (cached) {
    cached.cleanupListeners.forEach(fn => fn())
    cached.term.dispose()
    terminalCache.delete(ptyId)
  }
}

interface TerminalProps {
  ptyId: string
  themeId?: string
  fontFamily?: string
  onTitle?: (title: string) => void
  onCwdChange?: (cwd: string) => void
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  let term: XTerm | undefined
  let fitAddon: FitAddon | undefined
  let searchAddon: SearchAddon | undefined
  const [showSearch, setShowSearch] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal('')

  const focusTerminal = () => term?.focus()

  onCleanup(() => {
    // Don't destroy terminal — it may be reused after grid re-render
    // Just detach the resize observer for this container
    if (containerRef && resizeObserverRef) {
      resizeObserverRef.disconnect()
    }
  })

  let resizeObserverRef: ResizeObserver | undefined

  onMount(async () => {
    if (!containerRef) return

    // Check cache — reuse existing terminal if grid re-rendered
    const cached = terminalCache.get(props.ptyId)
    if (cached) {
      term = cached.term
      fitAddon = cached.fitAddon
      searchAddon = cached.searchAddon
      // Move existing terminal DOM to new container
      if (term.element) {
        containerRef.appendChild(term.element)
      }
      // Refit to new container size
      requestAnimationFrame(() => {
        fitAddon?.fit()
        if (term && fitAddon) {
          const dims = fitAddon.proposeDimensions()
          if (dims) pty.resize(props.ptyId, dims.rows, dims.cols)
        }
      })
      // New resize observer for new container
      resizeObserverRef = new ResizeObserver(() => {
        fitAddon?.fit()
        if (term && fitAddon) {
          const dims = fitAddon.proposeDimensions()
          if (dims) pty.resize(props.ptyId, dims.rows, dims.cols)
        }
      })
      resizeObserverRef.observe(containerRef)
      return
    }

    // Create new terminal instance
    term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      allowTransparency: true,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-bg').trim(),
        foreground: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-fg').trim(),
        cursor: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-cursor').trim(),
        selectionBackground: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-selection').trim(),
      },
    })

    fitAddon = new FitAddon()
    searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.open(containerRef)

    // Canvas renderer (default) — no WebGL to avoid GPU context limits with multiple panes

    fitAddon.fit()
    requestAnimationFrame(() => fitAddon?.fit())
    setTimeout(() => {
      fitAddon?.fit()
      term?.focus()
    }, 100)

    // Store in cache for reuse across grid re-renders
    const cleanupListeners: Array<() => void> = []
    terminalCache.set(props.ptyId, { term, fitAddon, searchAddon, cleanupListeners })

    // Listen for PTY output
    const unlisten = await listen<string>(`pty-output-${props.ptyId}`, (event) => {
      term?.write(event.payload)
    })
    cleanupListeners.push(() => unlisten())

    // Listen for PTY exit
    const unlistenExit = await listen<number>(`pty-exit-${props.ptyId}`, (event) => {
      const code = event.payload
      term?.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
      if (!document.hasFocus()) {
        try { new Notification('Azu', { body: `Process finished (exit ${code})`, silent: code === 0 }) } catch {}
      }
    })
    cleanupListeners.push(() => unlistenExit())

    // Send input to PTY
    term.onData((data) => {
      pty.write(props.ptyId, data)
    })

    // Resize observer
    resizeObserverRef = new ResizeObserver(() => {
      fitAddon?.fit()
      if (term && fitAddon) {
        const dims = fitAddon.proposeDimensions()
        if (dims) pty.resize(props.ptyId, dims.rows, dims.cols)
        }
    })
    resizeObserverRef.observe(containerRef)

    // Keyboard shortcuts
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'w')) return false
      if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'V')) return false

      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        if (term) { term.options.fontSize = Math.min((term.options.fontSize || 14) + 1, 32); fitAddon?.fit() }
        return false
      }
      if (e.ctrlKey && e.key === '-') {
        if (term) { term.options.fontSize = Math.max((term.options.fontSize || 14) - 1, 8); fitAddon?.fit() }
        return false
      }
      if (e.ctrlKey && e.key === '0') {
        if (term) { term.options.fontSize = 14; fitAddon?.fit() }
        return false
      }

      if (e.ctrlKey && e.key === 'c') {
        const selection = term!.getSelection()
        if (selection) {
          clipboard.writeText(selection)
          return false
        }
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        setShowSearch(!showSearch())
        return false
      }

      if (e.ctrlKey && e.key === 'v') {
        clipboard.saveImageToFile().then((path) => {
          if (path) pty.write(props.ptyId, path)
        }).catch(() => {})
        return true
      }

      return true
    })

    // OSC 7 — working directory
    term.parser.registerOscHandler(7, (data) => {
      if (props.onCwdChange) {
        let path = data
        if (path.startsWith('file:///')) path = path.slice(7)
        else if (path.startsWith('file://')) path = path.slice(5)
        try { path = decodeURIComponent(path) } catch {}
        if (path) props.onCwdChange(path)
      }
      return true
    })

    // OSC 0/2 — title change
    term.onTitleChange((title) => {
      if (props.onTitle && title) props.onTitle(title)
    })
  })

  // Detect if a hex color is "light" (for ANSI palette adjustment)
  const isLightBg = (hex: string): boolean => {
    if (!hex || hex.startsWith('rgba')) return false
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
  }

  // ANSI colors for light backgrounds (darker, higher contrast)
  const lightAnsi = {
    black: '#1a1a1a', red: '#c7243a', green: '#1a7a1a', yellow: '#8b6914',
    blue: '#1a3a8a', magenta: '#8a1a6a', cyan: '#0a6a6a', white: '#d0d0d0',
    brightBlack: '#4a4a4a', brightRed: '#e04040', brightGreen: '#2d8a2d',
    brightYellow: '#a07a1a', brightBlue: '#2a4aaa', brightMagenta: '#aa2a8a',
    brightCyan: '#1a8a8a', brightWhite: '#fafafa',
  }

  // Reactively update xterm theme — per-pane theme takes priority over global
  // Also reacts to bgAlpha changes for transparent backgrounds
  createEffect(() => {
    const paneThemeId = props.themeId
    const globalId = themeStore.activeId
    const _alpha = themeStore.bgAlpha // track reactivity
    const theme = paneThemeId ? themeStore.themes[paneThemeId] : themeStore.themes[globalId]
    if (term && theme) {
      const light = isLightBg(theme.colors.terminalBg)
      term.options.theme = {
        background: bgColor(theme.colors.terminalBg),
        foreground: theme.colors.terminalFg,
        cursor: theme.colors.terminalCursor,
        selectionBackground: theme.colors.terminalSelection,
        ...(light ? lightAnsi : {}),
      }
    }
  })

  // Reactively update font
  createEffect(() => {
    const font = props.fontFamily
    if (term && font) {
      term.options.fontFamily = `'${font}', monospace`
    }
  })

  return (
    <div
      class="relative w-full h-full"
      onWheel={(e) => {
        if (e.ctrlKey && term) {
          e.preventDefault()
          const delta = e.deltaY > 0 ? -1 : 1
          const size = Math.min(Math.max((term.options.fontSize || 14) + delta, 8), 32)
          term.options.fontSize = size
          fitAddon?.fit()
        }
      }}
    >
      {/* Search bar */}
      {showSearch() && (
        <div class="absolute top-0 right-0 z-10 flex items-center gap-1 p-1" style={{ background: 'var(--azu-surface-alt)', border: '1px solid var(--azu-border)', 'border-radius': '0 0 0 4px' }}>
          <input
            class="px-2 py-0.5 text-xs rounded border-none outline-none"
            style={{ background: 'var(--azu-surface)', color: 'var(--azu-text)', width: '180px' }}
            placeholder="Search..."
            value={searchQuery()}
            autofocus
            onInput={(e) => {
              setSearchQuery(e.target.value)
              if (e.target.value) searchAddon?.findNext(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) searchAddon?.findPrevious(searchQuery())
                else searchAddon?.findNext(searchQuery())
              }
              if (e.key === 'Escape') { setShowSearch(false); focusTerminal() }
            }}
          />
          <button class="px-1 text-xs" style={{ color: 'var(--azu-text-muted)' }} onClick={() => searchAddon?.findPrevious(searchQuery())}>↑</button>
          <button class="px-1 text-xs" style={{ color: 'var(--azu-text-muted)' }} onClick={() => searchAddon?.findNext(searchQuery())}>↓</button>
          <button class="px-1 text-xs" style={{ color: 'var(--azu-text-muted)' }} onClick={() => { setShowSearch(false); focusTerminal() }}>✕</button>
        </div>
      )}
      <div ref={containerRef} class="w-full h-full" onClick={focusTerminal} />
    </div>
  )
}

export default TerminalComponent
