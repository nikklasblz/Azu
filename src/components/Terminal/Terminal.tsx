import { Component, onMount, onCleanup, createEffect } from 'solid-js'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { listen } from '@tauri-apps/api/event'
import { pty, clipboard } from '../../lib/tauri-commands'
import { themeStore } from '../../stores/theme'

interface TerminalProps {
  ptyId: string
  themeId?: string
  fontFamily?: string
  onTitle?: (title: string) => void
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  let term: XTerm | undefined
  let fitAddon: FitAddon | undefined

  onMount(async () => {
    if (!containerRef) return

    term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-bg').trim(),
        foreground: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-fg').trim(),
        cursor: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-cursor').trim(),
        selectionBackground: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-selection').trim(),
      },
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
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
    setTimeout(() => fitAddon?.fit(), 100)

    // Listen for PTY output
    const unlisten = await listen<string>(`pty-output-${props.ptyId}`, (event) => {
      term?.write(event.payload)
    })

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

    // Handle Ctrl+C/V — clipboard integration
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true

      // Ctrl+C — copy selection if text selected, otherwise send SIGINT
      if (e.ctrlKey && e.key === 'c') {
        const selection = term!.getSelection()
        if (selection) {
          clipboard.writeText(selection)
          return false
        }
        return true
      }

      // Ctrl+V — always paste text to terminal
      if (e.ctrlKey && e.key === 'v') {
        clipboard.readText().then(text => {
          if (text) pty.write(props.ptyId, text)
        }).catch(() => {})
        return false
      }

      return true
    })

    onCleanup(() => {
      unlisten()
      resizeObserver.disconnect()
      term?.dispose()
    })
  })

  // Reactively update xterm theme — per-pane theme takes priority over global
  createEffect(() => {
    const paneThemeId = props.themeId
    const globalId = themeStore.activeId
    const theme = paneThemeId ? themeStore.themes[paneThemeId] : themeStore.themes[globalId]
    if (term && theme) {
      term.options.theme = {
        background: theme.colors.terminalBg,
        foreground: theme.colors.terminalFg,
        cursor: theme.colors.terminalCursor,
        selectionBackground: theme.colors.terminalSelection,
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

  return <div ref={containerRef} class="w-full h-full" />
}

export default TerminalComponent
