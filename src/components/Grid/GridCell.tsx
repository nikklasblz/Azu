import { Component, Show, For, createSignal } from 'solid-js'
import { GridNode, splitHorizontal, splitVertical, removeCell, setCellLabel, setCellTheme, setCellCwd } from '../../stores/grid'
import { getAvailableThemes, themeStore } from '../../stores/theme'
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

  const cellStyle = () => {
    const t = cellTheme()
    if (!t) return {}
    return {
      '--azu-surface': t.colors.surface,
      '--azu-surface-alt': t.colors.surfaceAlt,
      '--azu-border': t.colors.border,
      '--azu-text': t.colors.text,
      '--azu-text-muted': t.colors.textMuted,
      '--azu-accent': t.colors.accent,
      '--azu-success': t.colors.success,
      '--azu-error': t.colors.error,
      'background-color': t.colors.surface,
      'color': t.colors.text,
    } as Record<string, string>
  }

  return (
    <div
      class="relative w-full h-full overflow-hidden flex flex-col"
      style={cellStyle()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowThemeMenu(false) }}
    >
      {/* Cell toolbar */}
      <div
        class="h-6 flex items-center px-1.5 border-b shrink-0 gap-0.5 transition-opacity"
        style={{
          opacity: hovered() ? '1' : '0.3',
          'background-color': cellTheme()?.colors.surfaceAlt || 'var(--azu-surface-alt)',
          'border-color': cellTheme()?.colors.border || 'var(--azu-border)',
          color: cellTheme()?.colors.textMuted || 'var(--azu-text-muted)',
        }}
      >
        {/* Split buttons */}
        <button
          class="w-5 h-4 flex items-center justify-center rounded hover:opacity-80"
          onClick={() => handleSplit('h')}
          title="Split Right"
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="1" y="1" width="10" height="10" rx="1" />
            <line x1="6" y1="1" x2="6" y2="11" />
          </svg>
        </button>
        <button
          class="w-5 h-4 flex items-center justify-center rounded hover:opacity-80"
          onClick={() => handleSplit('v')}
          title="Split Down"
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="1" y="1" width="10" height="10" rx="1" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>

        {/* Folder picker */}
        <button
          class="w-5 h-4 flex items-center justify-center rounded hover:opacity-80"
          onClick={handlePickFolder}
          title={props.node.cwd || 'Set project folder'}
        >
          <svg width="9" height="8" viewBox="0 0 14 12" fill="currentColor">
            <path d="M1 1h4l2 2h6v8H1V1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
          </svg>
        </button>

        {/* Editable label / cwd display */}
        <Show when={editing()} fallback={
          <span
            class="flex-1 text-center cursor-pointer truncate px-1 text-xs"
            style={{ color: cellTheme()?.colors.text || 'var(--azu-text)' }}
            onDblClick={() => setEditing(true)}
            title={props.node.cwd || 'Double-click to rename'}
          >
            {props.node.label || abbreviatedCwd() || 'Terminal'}
          </span>
        }>
          <input
            class="flex-1 text-center text-xs px-1 rounded border-none outline-none"
            style={{
              background: cellTheme()?.colors.surface || 'var(--azu-surface)',
              color: cellTheme()?.colors.text || 'var(--azu-text)',
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
            class="w-5 h-4 flex items-center justify-center rounded hover:opacity-80"
            onClick={() => setShowThemeMenu(!showThemeMenu())}
            title="Pane theme"
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" />
              <path d="M6 6 L6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="currentColor" />
            </svg>
          </button>
          <Show when={showThemeMenu()}>
            <div
              class="absolute top-full right-0 mt-1 rounded shadow-lg z-50 min-w-44 p-1 max-h-64 overflow-y-auto"
              style={{
                background: cellTheme()?.colors.surfaceAlt || 'var(--azu-surface-alt)',
                border: `1px solid ${cellTheme()?.colors.border || 'var(--azu-border)'}`,
              }}
            >
              <button
                class="flex items-center gap-2 w-full px-2 py-1 text-left text-xs rounded hover:opacity-80"
                style={{ color: cellTheme()?.colors.textMuted || 'var(--azu-text-muted)' }}
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
                        ? (cellTheme()?.colors.accent || 'var(--azu-accent)')
                        : (cellTheme()?.colors.text || 'var(--azu-text)'),
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
          class="w-5 h-4 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: cellTheme()?.colors.error || 'var(--azu-error)' }}
          onClick={() => removeCell(props.node.id)}
          title="Close"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      </div>

      {/* Terminal — auto-request PTY if missing */}
      <div class="flex-1 overflow-hidden">
        <Show when={props.ptyId} fallback={
          <div class="flex items-center justify-center h-full" style={{ color: cellTheme()?.colors.textMuted || 'var(--azu-text-muted)' }}>
            <span class="text-xs animate-pulse">Starting terminal...</span>
          </div>
        }>
          {(id) => (
            <TerminalComponent
              ptyId={id()}
              themeId={props.node.themeId}
              onCwdChange={handleCwdChange}
            />
          )}
        </Show>
      </div>
    </div>
  )
}

export default GridCell
