import { Component, onMount, onCleanup } from 'solid-js'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { pty } from '../../lib/tauri-commands'
import { AzuTerminal } from '../../terminal'

export function destroyTerminal(_ptyId: string) {
  // No-op — each component manages its own terminal
}

interface TerminalProps {
  ptyId: string
  themeId?: string
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  let term: AzuTerminal | null = null
  let unlistenOutput: UnlistenFn | null = null
  let unlistenExit: UnlistenFn | null = null

  onMount(async () => {
    if (!containerRef) return

    // Always create a fresh terminal — no registry, no sharing
    term = new AzuTerminal({
      cols: 80,
      rows: 24,
      fontSize: 14,
    })

    term.attach(containerRef)

    // Resize PTY to match
    const dims = term.fit()
    pty.resize(props.ptyId, dims.rows, dims.cols).catch(() => {})

    // PTY output → terminal
    unlistenOutput = await listen<string>(`pty-output-${props.ptyId}`, (event) => {
      term?.write(event.payload)
    })

    // PTY exit
    unlistenExit = await listen<number>(`pty-exit-${props.ptyId}`, (event) => {
      const code = event.payload
      term?.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
    })

    // Keyboard → PTY
    term.onData((data) => {
      pty.write(props.ptyId, data)
    })

    setTimeout(() => term?.focus(), 100)
  })

  onCleanup(() => {
    unlistenOutput?.()
    unlistenExit?.()
    if (term) {
      term.dispose()
      term = null
    }
  })

  return <div ref={containerRef} class="w-full h-full" style={{ background: 'var(--azu-terminal-bg)' }} />
}

export default TerminalComponent
