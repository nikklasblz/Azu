import { Component, Show, For, createSignal } from 'solid-js'
import { GridNode, splitHorizontal, splitVertical, removeCell, setCellLabel, setCellTheme } from '../../stores/grid'
import { getAvailableThemes, themeStore } from '../../stores/theme'
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
        class="h-6 flex items-center px-2 border-b shrink-0 text-xs gap-1 transition-opacity"
        style={{
          opacity: hovered() ? '1' : '0.4',
          'background-color': cellTheme()?.colors.surfaceAlt || 'var(--azu-surface-alt)',
          'border-color': cellTheme()?.colors.border || 'var(--azu-border)',
          color: cellTheme()?.colors.textMuted || 'var(--azu-text-muted)',
        }}
      >
        {/* Split buttons */}
        <button
          class="px-1.5 py-0.5 rounded hover:opacity-80"
          onClick={() => handleSplit('h')}
          title="Split Right"
        >⫼</button>
        <button
          class="px-1.5 py-0.5 rounded hover:opacity-80"
          onClick={() => handleSplit('v')}
          title="Split Down"
        >⊟</button>

        {/* Editable label */}
        <Show when={editing()} fallback={
          <span
            class="flex-1 text-center cursor-pointer truncate px-2"
            style={{ color: cellTheme()?.colors.text || 'var(--azu-text)' }}
            onDblClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {props.node.label || 'Terminal'}
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
            class="px-1.5 py-0.5 rounded hover:opacity-80"
            onClick={() => setShowThemeMenu(!showThemeMenu())}
            title="Pane theme"
          >◐</button>
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
          class="px-1.5 py-0.5 rounded hover:opacity-80"
          style={{ color: cellTheme()?.colors.error || 'var(--azu-error)' }}
          onClick={() => removeCell(props.node.id)}
          title="Close"
        >✕</button>
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
            />
          )}
        </Show>
      </div>
    </div>
  )
}

export default GridCell
