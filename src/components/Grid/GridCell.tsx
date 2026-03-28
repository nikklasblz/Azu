import { Component, Show, createSignal } from 'solid-js'
import { GridNode, splitHorizontal, splitVertical, removeCell } from '../../stores/grid'
import TerminalComponent from '../Terminal/Terminal'

interface GridCellProps {
  node: GridNode
  ptyId?: string
  onRequestPty: (cellId: string) => void
  onSplit?: () => void
}

const GridCell: Component<GridCellProps> = (props) => {
  const [hovered, setHovered] = createSignal(false)

  const handleSplit = (direction: 'h' | 'v') => {
    if (direction === 'h') splitHorizontal(props.node.id)
    else splitVertical(props.node.id)
    if (props.onSplit) setTimeout(() => props.onSplit!(), 50)
  }

  return (
    <div
      class="relative w-full h-full overflow-hidden flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Cell toolbar — visible on hover */}
      <div
        class="h-6 flex items-center px-2 bg-surface-alt border-b border-border shrink-0 text-xs gap-1 transition-opacity"
        style={{ opacity: hovered() ? '1' : '0.3' }}
      >
        <button
          class="px-1.5 py-0.5 rounded hover:bg-surface text-text-muted hover:text-text"
          onClick={() => handleSplit('h')}
          title="Split Right"
        >
          ⫼
        </button>
        <button
          class="px-1.5 py-0.5 rounded hover:bg-surface text-text-muted hover:text-text"
          onClick={() => handleSplit('v')}
          title="Split Down"
        >
          ⊟
        </button>
        <div class="flex-1" />
        <button
          class="px-1.5 py-0.5 rounded hover:bg-surface text-text-muted hover:text-error"
          onClick={() => removeCell(props.node.id)}
          title="Close"
        >
          ✕
        </button>
      </div>
      {/* Terminal or empty cell */}
      <div class="flex-1 overflow-hidden">
        <Show when={props.ptyId}>
          {(id) => <TerminalComponent ptyId={id()} />}
        </Show>
        <Show when={!props.ptyId}>
          <div class="flex items-center justify-center h-full text-text-muted">
            <button
              class="px-3 py-1 border border-border rounded hover:bg-surface-alt"
              onClick={() => props.onRequestPty(props.node.id)}
            >
              + New Terminal
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default GridCell
