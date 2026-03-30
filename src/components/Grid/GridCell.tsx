import { Component, Show, For, createSignal } from 'solid-js'
import { GridNode, splitHorizontal, splitVertical, removeCell, setCellLabel, setCellTheme, setCellCwd, swapCells, gridStore, findAllLeaves } from '../../stores/grid'
import { getAvailableThemes, themeStore, bgColor, toolbarColor } from '../../stores/theme'
import { dialog, pty } from '../../lib/tauri-commands'
import TerminalComponent from '../Terminal/Terminal'

interface GridCellProps {
  node: GridNode
  ptyId?: string
  onRequestPty: (cellId: string) => void
  onSplit?: () => void
}

const GridCell: Component<GridCellProps> = (props) => {
  const [hovered, setHovered] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [showThemeMenu, setShowThemeMenu] = createSignal(false)
  const [showLaunchMenu, setShowLaunchMenu] = createSignal(false)
  const [showSwapMenu, setShowSwapMenu] = createSignal(false)

  const otherLeaves = () => findAllLeaves(gridStore.root).filter(n => n.id !== props.node.id)

  const launchOptions = [
    { label: 'Claude', cmd: 'claude' },
    { label: 'Claude (yolo)', cmd: 'claude --dangerously-skip-permissions' },
    { label: 'Codex', cmd: 'codex' },
    { label: 'Codex (full-auto)', cmd: 'codex --full-auto' },
  ]

  const sendCommand = async (cmd: string) => {
    if (!props.ptyId) return
    await pty.write(props.ptyId, cmd)
    await new Promise(r => setTimeout(r, 50))
    await pty.write(props.ptyId, '\r')
    setShowLaunchMenu(false)
  }

  const handleSplit = (direction: 'h' | 'v') => {
    if (direction === 'h') splitHorizontal(props.node.id)
    else splitVertical(props.node.id)
    if (props.onSplit) setTimeout(() => props.onSplit!(), 50)
  }

  const handlePickFolder = async () => {
    const folder = await dialog.pickFolder()
    if (folder && props.ptyId) {
      setCellCwd(props.node.id, folder)
      const id = props.ptyId
      // Delay after native dialog — ConPTY needs time to restore input state
      await new Promise(r => setTimeout(r, 200))
      // PowerShell: cd works across drives natively
      await pty.write(id, `cd "${folder}"`)
      await new Promise(r => setTimeout(r, 50))
      await pty.write(id, '\r')
    }
  }

  const handleCwdChange = (newCwd: string) => {
    setCellCwd(props.node.id, newCwd)
  }

  const abbreviatedCwd = () => {
    const cwd = props.node.cwd
    if (!cwd) return null
    const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 2) return parts.join('/')
    return '.../' + parts.slice(-2).join('/')
  }

  const cellTheme = () => {
    const tid = props.node.themeId
    if (tid) return themeStore.themes[tid]
    return null
  }

  // Always returns solid colors — never CSS variables
  const colors = () => {
    const t = cellTheme() || themeStore.themes[themeStore.activeId]
    return t?.colors || { surface: '#0d1117', surfaceAlt: '#161b22', border: '#30363d', text: '#c9d1d9', textMuted: '#8b949e', accent: '#58a6ff', error: '#f85149' } as any
  }

  const cellStyle = () => {
    const t = cellTheme()
    if (!t) return {}
    return {
      '--azu-surface': bgColor(t.colors.surface),
      '--azu-surface-alt': bgColor(t.colors.surfaceAlt),
      '--azu-border': t.colors.border,
      '--azu-text': t.colors.text,
      '--azu-text-muted': t.colors.textMuted,
      '--azu-accent': t.colors.accent,
      '--azu-success': t.colors.success,
      '--azu-error': t.colors.error,
      'background-color': bgColor(t.colors.surface),
      'color': t.colors.text,
    } as Record<string, string>
  }

  return (
    <div
      class="relative w-full h-full overflow-hidden flex flex-col"
      style={cellStyle()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowThemeMenu(false); setShowLaunchMenu(false); setShowSwapMenu(false) }}
    >
      {/* Cell toolbar */}
      <div
        class="h-7 flex items-center px-1.5 shrink-0 gap-1"
        style={{
          'background-color': bgColor(colors().surfaceAlt),
          'border-bottom': `1px solid ${colors().border}`,
          color: toolbarColor(colors()),
          'font-family': 'var(--azu-font-ui)',
        }}
      >
        {/* Swap pane position */}
        <Show when={otherLeaves().length > 0}>
          <div class="relative">
            <button
              class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
              onClick={() => setShowSwapMenu(!showSwapMenu())}
              title="Swap with another pane"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M2 4L5 1L8 4" /><line x1="5" y1="1" x2="5" y2="8" />
                <path d="M10 8L7 11L4 8" /><line x1="7" y1="11" x2="7" y2="4" />
              </svg>
            </button>
            <Show when={showSwapMenu()}>
              <div
                class="absolute top-full left-0 rounded shadow-lg z-50 min-w-36 p-1"
                style={{ background: colors().surface, border: `1px solid ${colors().border}` }}
              >
                <div class="px-2 py-1 text-[10px]" style={{ color: colors().textMuted }}>Swap with</div>
                <For each={otherLeaves()}>
                  {(leaf) => (
                    <button
                      class="w-full px-2 py-1 text-left text-xs hover:bg-white/10"
                      style={{ color: colors().text }}
                      onClick={() => {
                        swapCells(props.node.id, leaf.id)
                        setShowSwapMenu(false)
                      }}
                    >
                      {leaf.label || leaf.cwd?.split(/[/\\]/).pop() || leaf.id}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          onClick={() => handleSplit('h')}
          title="Split Right"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="1" y="1" width="10" height="10" />
            <line x1="6" y1="1" x2="6" y2="11" />
          </svg>
        </button>
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          onClick={() => handleSplit('v')}
          title="Split Down"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="1" y="1" width="10" height="10" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          onClick={handlePickFolder}
          title={props.node.cwd || 'Set project folder'}
        >
          <svg width="11" height="11" viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M1 2h5l2 2h6v8H1V2z" />
          </svg>
        </button>

        {/* Launch CLI */}
        <div class="relative">
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            style={{ color: colors().accent }}
            onClick={() => setShowLaunchMenu(!showLaunchMenu())}
            title="Launch CLI"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="3,1 10,6 3,11" />
            </svg>
          </button>
          <Show when={showLaunchMenu()}>
            <div
              class="absolute top-full left-0 mt-1 rounded shadow-lg z-50 min-w-48 p-1"
              style={{
                background: colors().surface,
                border: `1px solid ${colors().border}`,
              }}
            >
              <div class="px-3 py-1 text-[10px] font-medium" style={{ color: colors().textMuted }}>Launch CLI</div>
              <For each={launchOptions}>
                {(opt) => (
                  <button
                    class="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-white/10"
                    style={{ color: colors().text }}
                    onClick={() => sendCommand(opt.cmd)}
                  >
                    {opt.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Editable label / cwd display */}
        <Show when={editing()} fallback={
          <span
            class="flex-1 text-center cursor-pointer truncate px-1 text-xs"
            style={{ color: colors().text }}
            onDblClick={() => setEditing(true)}
            title={props.node.cwd || 'Double-click to rename'}
          >
            {props.node.label || abbreviatedCwd() || 'Terminal'}
          </span>
        }>
          <input
            class="flex-1 text-center text-xs px-1 rounded border-none outline-none"
            style={{
              background: colors().surface,
              color: colors().text,
            }}
            value={props.node.label || 'Terminal'}
            autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setCellLabel(props.node.id, (e.target as HTMLInputElement).value)
                setEditing(false)
              }
              if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={(e) => {
              setCellLabel(props.node.id, e.target.value)
              setEditing(false)
            }}
          />
        </Show>

        {/* Per-pane theme selector */}
        <div class="relative">
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            onClick={() => setShowThemeMenu(!showThemeMenu())}
            title="Pane theme"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1" />
              <path d="M6 6 L6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="currentColor" />
            </svg>
          </button>
          <Show when={showThemeMenu()}>
            <div
              class="absolute top-full right-0 mt-1 rounded shadow-lg z-50 min-w-44 p-1 max-h-64 overflow-y-auto"
              style={{
                background: colors().surfaceAlt,
                border: `1px solid ${colors().border}`,
              }}
            >
              <button
                class="flex items-center gap-2 w-full px-2 py-1 text-left text-xs rounded hover:opacity-80"
                style={{ color: colors().textMuted }}
                onClick={() => { setCellTheme(props.node.id, ''); setShowThemeMenu(false) }}
              >
                ↩ Use global theme
              </button>
              <For each={getAvailableThemes()}>
                {(theme) => (
                  <button
                    class="flex items-center gap-2 w-full px-2 py-1 text-left text-xs rounded hover:opacity-80"
                    style={{
                      color: props.node.themeId === theme.id
                        ? (colors().accent)
                        : (colors().text),
                    }}
                    onClick={() => { setCellTheme(props.node.id, theme.id); setShowThemeMenu(false) }}
                  >
                    <div class="flex gap-0.5 shrink-0">
                      <div class="w-2.5 h-2.5 rounded-full" style={{ background: theme.colors.surface, border: '1px solid ' + theme.colors.border }} />
                      <div class="w-2.5 h-2.5 rounded-full" style={{ background: theme.colors.accent }} />
                    </div>
                    <span>{theme.name}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Close button */}
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          style={{ color: colors().error }}
          onClick={() => removeCell(props.node.id)}
          title="Close"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
            <line x1="3" y1="3" x2="9" y2="9" />
            <line x1="9" y1="3" x2="3" y2="9" />
          </svg>
        </button>
      </div>

      {/* Terminal — auto-request PTY if missing */}
      <div class="flex-1 overflow-hidden">
        <Show when={props.ptyId} fallback={
          <div class="flex items-center justify-center h-full" style={{ color: colors().textMuted }}>
            <span class="text-xs animate-pulse">Starting terminal...</span>
          </div>
        }>
          {(id) => (
            <TerminalComponent
              ptyId={id()}
              themeId={props.node.themeId}
              onCwdChange={handleCwdChange}
              onTitle={(title) => {
                // Auto-rename pane if user hasn't set a custom label
                if (!props.node.label) setCellLabel(props.node.id, title)
              }}
            />
          )}
        </Show>
      </div>
    </div>
  )
}

export default GridCell
