// src/components/Terminal/Terminal.tsx
import { Component, onMount, onCleanup } from 'solid-js'
import { listen } from '@tauri-apps/api/event'
import { pty } from '../../lib/tauri-commands'
import { AzuTerminal } from '../../terminal'

// Global registry: ptyId → AzuTerminal instance
// Survives component destruction — that's the whole point
const terminalRegistry = new Map<string, AzuTerminal>()

export function destroyTerminal(ptyId: string) {
  const term = terminalRegistry.get(ptyId)
  if (term) {
    term.dispose()
    terminalRegistry.delete(ptyId)
  }
}

interface TerminalProps {
  ptyId: string
  themeId?: string
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined

  onMount(async () => {
    if (!containerRef) return

    // Check if terminal already exists (re-mount after split)
    let term = terminalRegistry.get(props.ptyId)

    if (!term) {
      // First mount — create terminal and wire up PTY
      term = new AzuTerminal({
        cols: 80, rows: 24,
        fontSize: 14,
      })
      terminalRegistry.set(props.ptyId, term)

      // PTY output → terminal
      listen<string>(`pty-output-${props.ptyId}`, (event) => {
        term!.write(event.payload)
      })

      // PTY exit
      listen<number>(`pty-exit-${props.ptyId}`, (event) => {
        const code = event.payload
        term!.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
      })

      // Keyboard → PTY
      term.onData((data) => {
        pty.write(props.ptyId, data)
      })
    }

    // Attach to this container (works for both new and re-mounted)
    term.attach(containerRef)

    // Resize PTY to match terminal dimensions
    const dims = term.fit()
    pty.resize(props.ptyId, dims.rows, dims.cols)

    setTimeout(() => term!.focus(), 100)
  })

  onCleanup(() => {
    // Detach but DON'T destroy — terminal state survives in registry
    const term = terminalRegistry.get(props.ptyId)
    if (term) term.detach()
  })

  return <div ref={containerRef} class="w-full h-full" style={{ background: 'var(--azu-terminal-bg)' }} />
}

export default TerminalComponent
