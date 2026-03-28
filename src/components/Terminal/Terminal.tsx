import { Component, onMount, onCleanup } from 'solid-js'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { listen } from '@tauri-apps/api/event'
import { pty } from '../../lib/tauri-commands'

interface TerminalProps {
  ptyId: string
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

    onCleanup(() => {
      unlisten()
      resizeObserver.disconnect()
      term?.dispose()
    })
  })

  return <div ref={containerRef} class="w-full h-full" />
}

export default TerminalComponent
