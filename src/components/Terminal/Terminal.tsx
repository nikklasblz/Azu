import { Component, onMount, onCleanup, createEffect, createSignal } from 'solid-js'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { listen } from '@tauri-apps/api/event'
import { pty, clipboard } from '../../lib/tauri-commands'
import { themeStore, bgColor } from '../../stores/theme'

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

  // Collect cleanup fns synchronously so SolidJS registers them correctly
  const cleanupFns: Array<() => void> = []
  onCleanup(() => cleanupFns.forEach(fn => fn()))

  onMount(async () => {
    if (!containerRef) return

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

    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
    } catch {
      // WebGL not available, fallback to canvas
    }

    fitAddon.fit()
    // Refit after layout settles
    requestAnimationFrame(() => fitAddon?.fit())
    setTimeout(() => {
      fitAddon?.fit()
      term?.focus()
    }, 100)

    // Listen for PTY output
    const unlisten = await listen<string>(`pty-output-${props.ptyId}`, (event) => {
      term?.write(event.payload)
    })
    cleanupFns.push(() => unlisten())

    // Listen for PTY exit — notify user
    const unlistenExit = await listen<number>(`pty-exit-${props.ptyId}`, (event) => {
      const code = event.payload
      term?.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
      // Flash taskbar if window not focused
      if (!document.hasFocus()) {
        try { new Notification('Azu', { body: `Process finished (exit ${code})`, silent: code === 0 }) } catch {}
      }
    })
    cleanupFns.push(() => unlistenExit())

    // Send input to PTY
    term.onData((data) => {
      pty.write(props.ptyId, data)
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
      if (term && fitAddon) {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          pty.resize(props.ptyId, dims.rows, dims.cols)
        }
      }
    })
    resizeObserver.observe(containerRef)
    cleanupFns.push(() => resizeObserver.disconnect())
    cleanupFns.push(() => term?.dispose())

    // Handle keyboard shortcuts — return false to prevent xterm from processing
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true

      // Block these combos from xterm — let them bubble to global keybindings
      if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'w')) return false
      if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'V')) return false

      // Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset
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

      // Ctrl+Shift+F — toggle search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        setShowSearch(!showSearch())
        return false
      }

      // Ctrl+V — check for image in clipboard, save to temp file and type path
      if (e.ctrlKey && e.key === 'v') {
        clipboard.saveImageToFile().then((path) => {
          if (path) {
            // Image found — type the file path into terminal
            pty.write(props.ptyId, path)
          }
          // If no image, let xterm handle text paste normally (already happened)
        }).catch(() => {})
        // Return true to also let xterm paste text normally
        return true
      }

      return true
    })

    // OSC 7 — shell reports current working directory
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

    // OSC 0/2 — terminal title change (auto-rename pane)
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
    <div class="relative w-full h-full">
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
