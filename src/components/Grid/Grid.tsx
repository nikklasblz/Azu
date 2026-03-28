import { Component, For, Show, createEffect, on } from 'solid-js'
import { GridNode, gridStore, updateRatios } from '../../stores/grid'
import GridCell from './GridCell'
import GridResizer from './GridResizer'

interface GridProps {
  ptyMap: Record<string, string>
  onRequestPty: (cellId: string) => void
}

function findLeaves(node: GridNode): string[] {
  if (node.type === 'leaf') return [node.id]
  return (node.children || []).flatMap(findLeaves)
}

const GridContainer: Component<GridProps> = (props) => {
  // Track PTY requests in-flight to prevent duplicates
  const pendingPtyRequests = new Set<string>()

  // Auto-create PTYs for any leaf cell missing one
  const autoCreatePtys = () => {
    const leaves = findLeaves(gridStore.root)
    for (const leafId of leaves) {
      if (!props.ptyMap[leafId] && !pendingPtyRequests.has(leafId)) {
        pendingPtyRequests.add(leafId)
        props.onRequestPty(leafId)
      }
    }
  }

  // Clear pending requests once ptyMap confirms creation
  createEffect(() => {
    const map = props.ptyMap
    for (const leafId of [...pendingPtyRequests]) {
      if (map[leafId]) pendingPtyRequests.delete(leafId)
    }
  })

  // Watch for grid changes and auto-create PTYs
  createEffect(on(
    () => JSON.stringify(gridStore.root),
    () => setTimeout(autoCreatePtys, 50),
    { defer: true }
  ))

  const renderNode = (node: GridNode) => {
    if (node.type === 'leaf') {
      return (
        <GridCell
          node={node}
          ptyId={props.ptyMap[node.id]}
          onRequestPty={props.onRequestPty}
          onSplit={autoCreatePtys}
        />
      )
    }

    const isRow = node.type === 'row'
    const ratios = node.ratios || node.children!.map(() => 1 / node.children!.length)

    return (
      <div
        class="w-full h-full"
        style={{
          display: 'flex',
          'flex-direction': isRow ? 'row' : 'column',
        }}
      >
        <For each={node.children!}>
          {(child, index) => (
            <>
              <div
                style={{
                  [isRow ? 'width' : 'height']: `${ratios[index()] * 100}%`,
                  [isRow ? 'height' : 'width']: '100%',
                  overflow: 'hidden',
                }}
              >
                {renderNode(child)}
              </div>
              <Show when={index() < node.children!.length - 1}>
                <GridResizer
                  direction={isRow ? 'horizontal' : 'vertical'}
                  onResize={(delta) => {
                    const container = isRow
                      ? document.querySelector('main')?.clientWidth || 800
                      : document.querySelector('main')?.clientHeight || 600
                    const pctDelta = delta / container
                    const newRatios = [...ratios]
                    newRatios[index()] = Math.max(0.1, ratios[index()] + pctDelta)
                    newRatios[index() + 1] = Math.max(0.1, ratios[index() + 1] - pctDelta)
                    updateRatios(node.id, newRatios)
                  }}
                />
              </Show>
            </>
          )}
        </For>
      </div>
    )
  }

  return <div class="w-full h-full overflow-hidden">{renderNode(gridStore.root)}</div>
}

export default GridContainer
