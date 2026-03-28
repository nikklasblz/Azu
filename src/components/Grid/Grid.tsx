import { Component, For, Show } from 'solid-js'
import { GridNode, gridStore, updateRatios } from '../../stores/grid'
import GridCell from './GridCell'
import GridResizer from './GridResizer'

interface GridProps {
  ptyMap: Record<string, string>
  onRequestPty: (cellId: string) => void
}

const GridContainer: Component<GridProps> = (props) => {
  // Auto-create PTYs for leaf cells that don't have one
  const autoCreatePtys = () => {
    const findLeaves = (node: GridNode): string[] => {
      if (node.type === 'leaf') return [node.id]
      return (node.children || []).flatMap(findLeaves)
    }
    const leaves = findLeaves(gridStore.root)
    for (const leafId of leaves) {
      if (!props.ptyMap[leafId]) {
        props.onRequestPty(leafId)
      }
    }
  }

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
