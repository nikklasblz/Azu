import { Component, onMount, onCleanup, createEffect } from 'solid-js'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { pty } from '../../lib/tauri-commands'
import { AzuTerminal } from '../../terminal'
import { themeStore, bgColor } from '../../stores/theme'
import { TerminalTheme } from '../../terminal/types'

export function destroyTerminal(_ptyId: string) {}

interface TerminalProps {
  ptyId: string
  themeId?: string
}

// Convert Azu theme to AzuTerminal theme
function resolveTheme(themeId?: string): TerminalTheme | undefined {
  const id = themeId || themeStore.activeId
  const theme = themeStore.themes[id]
  if (!theme) return undefined
  return {
    background: bgColor(theme.colors.terminalBg || theme.colors.surface),
    foreground: theme.colors.terminalFg || theme.colors.text,
    cursor: theme.colors.terminalCursor || theme.colors.accent,
    selectionBackground: theme.colors.terminalSelection || 'rgba(56,139,253,0.3)',
    black: theme.colors.ansi?.black || '#484f58',
    red: theme.colors.ansi?.red || '#ff7b72',
    green: theme.colors.ansi?.green || '#3fb950',
    yellow: theme.colors.ansi?.yellow || '#d29922',
    blue: theme.colors.ansi?.blue || '#58a6ff',
    magenta: theme.colors.ansi?.magenta || '#bc8cff',
    cyan: theme.colors.ansi?.cyan || '#39d2c0',
    white: theme.colors.ansi?.white || '#b1bac4',
    brightBlack: theme.colors.ansi?.brightBlack || '#6e7681',
    brightRed: theme.colors.ansi?.brightRed || '#ffa198',
    brightGreen: theme.colors.ansi?.brightGreen || '#56d364',
    brightYellow: theme.colors.ansi?.brightYellow || '#e3b341',
    brightBlue: theme.colors.ansi?.brightBlue || '#79c0ff',
    brightMagenta: theme.colors.ansi?.brightMagenta || '#d2a8ff',
    brightCyan: theme.colors.ansi?.brightCyan || '#56d4dd',
    brightWhite: theme.colors.ansi?.brightWhite || '#f0f6fc',
  }
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  let term: AzuTerminal | null = null
  let unlistenOutput: UnlistenFn | null = null
  let unlistenExit: UnlistenFn | null = null

  onMount(async () => {
    if (!containerRef) return

    const theme = resolveTheme(props.themeId)

    term = new AzuTerminal({
      cols: 80,
      rows: 24,
      fontSize: 14,
      theme: theme,
    })

    term.attach(containerRef)

    const dims = term.fit()
    pty.resize(props.ptyId, dims.rows, dims.cols).catch(() => {})

    unlistenOutput = await listen<string>(`pty-output-${props.ptyId}`, (event) => {
      term?.write(event.payload)
    })

    unlistenExit = await listen<number>(`pty-exit-${props.ptyId}`, (event) => {
      const code = event.payload
      term?.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
    })

    term.onData((data) => {
      pty.write(props.ptyId, data)
    })

    setTimeout(() => term?.focus(), 100)
  })

  // React to theme + opacity changes
  createEffect(() => {
    const _alpha = themeStore.bgAlpha // track bgAlpha reactivity
    const _id = themeStore.activeId   // track theme switch
    const theme = resolveTheme(props.themeId)
    if (term && theme) term.setTheme(theme)
  })

  onCleanup(() => {
    unlistenOutput?.()
    unlistenExit?.()
    if (term) {
      term.dispose()
      term = null
    }
  })

  return <div ref={containerRef} class="w-full h-full" />
}

export default TerminalComponent
