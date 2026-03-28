import { Component, Show, createSignal } from 'solid-js'
import { GridNode, splitHorizontal, splitVertical, removeCell } from '../../stores/grid'
import TerminalComponent from '../Terminal/Terminal'

interface GridCellProps {
  node: GridNode
  ptyId?: string
  onRequestPty: (cellId: string) => void
}

const GridCell: Component<GridCellProps> = (props) => {
  const [showMenu, setShowMenu] = createSignal(false)

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    setShowMenu(!showMenu())
  }

  return (
    <div class="relative w-full h-full overflow-hidden" onContextMenu={handleContextMenu}>
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
      <Show when={showMenu()}>
        <div class="absolute top-2 right-2 bg-surface-alt border border-border rounded shadow-lg z-50 text-sm">
          <button
            class="block w-full px-4 py-2 text-left hover:bg-surface text-text"
            onClick={() => { splitHorizontal(props.node.id); setShowMenu(false) }}
          >
            Split Right
          </button>
          <button
            class="block w-full px-4 py-2 text-left hover:bg-surface text-text"
            onClick={() => { splitVertical(props.node.id); setShowMenu(false) }}
          >
            Split Down
          </button>
          <button
            class="block w-full px-4 py-2 text-left hover:bg-surface text-error"
            onClick={() => { removeCell(props.node.id); setShowMenu(false) }}
          >
            Close
          </button>
        </div>
      </Show>
    </div>
  )
}

export default GridCell
