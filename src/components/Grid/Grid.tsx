import { Component, For, createEffect, on } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { GridNode, gridStore, updateRatios, findAllLeaves, findNode } from '../../stores/grid'
import GridCell from './GridCell'
import GridResizer from './GridResizer'

interface GridProps {
  ptyMap: Record<string, string>
  onRequestPty: (cellId: string) => void
}

// Computed layout for a leaf cell — absolute position within the grid
interface CellLayout {
  id: string
  node: GridNode
  x: number  // 0-1 fraction
  y: number
  w: number
  h: number
}

// Computed layout for a resizer between cells
interface ResizerLayout {
  key: string
  nodeId: string
  direction: 'horizontal' | 'vertical'
  x: number
  y: number
  w: number
  h: number
  index: number
}

// Traverse grid tree, compute absolute position for each leaf
function computeCellLayouts(node: GridNode, area = { x: 0, y: 0, w: 1, h: 1 }): CellLayout[] {
  if (node.type === 'leaf') {
    return [{ id: node.id, node, ...area }]
  }

  const ratios = node.ratios || node.children!.map(() => 1 / node.children!.length)
  const isRow = node.type === 'row'
  let offset = 0

  return node.children!.flatMap((child, i) => {
    const r = ratios[i]
    const childArea = isRow
      ? { x: area.x + offset * area.w, y: area.y, w: area.w * r, h: area.h }
      : { x: area.x, y: area.y + offset * area.h, w: area.w, h: area.h * r }
    offset += r
    return computeCellLayouts(child, childArea)
  })
}

// Traverse grid tree, compute resizer positions
function computeResizerLayouts(node: GridNode, area = { x: 0, y: 0, w: 1, h: 1 }): ResizerLayout[] {
  if (node.type === 'leaf') return []

  const ratios = node.ratios || node.children!.map(() => 1 / node.children!.length)
  const isRow = node.type === 'row'
  const resizers: ResizerLayout[] = []
  let offset = 0

  for (let i = 0; i < node.children!.length; i++) {
    offset += ratios[i]

    // Add resizer between children (not after last)
    if (i < node.children!.length - 1) {
      resizers.push({
        key: `${node.id}-${i}`,
        nodeId: node.id,
        direction: isRow ? 'horizontal' : 'vertical',
        x: isRow ? area.x + offset * area.w : area.x,
        y: isRow ? area.y : area.y + offset * area.h,
        w: isRow ? 0 : area.w,
        h: isRow ? area.h : 0,
        index: i,
      })
    }
  }

  // Recurse into children
  offset = 0
  for (let i = 0; i < node.children!.length; i++) {
    const r = ratios[i]
    const childArea = isRow
      ? { x: area.x + offset * area.w, y: area.y, w: area.w * r, h: area.h }
      : { x: area.x, y: area.y + offset * area.h, w: area.w, h: area.h * r }
    offset += r
    resizers.push(...computeResizerLayouts(node.children![i], childArea))
  }

  return resizers
}

const GridContainer: Component<GridProps> = (props) => {
  const pendingPtyRequests = new Set<string>()

  const autoCreatePtys = () => {
    const leaves = findAllLeaves(gridStore.root)
    for (const leaf of leaves) {
      if (!props.ptyMap[leaf.id] && !pendingPtyRequests.has(leaf.id)) {
        pendingPtyRequests.add(leaf.id)
        props.onRequestPty(leaf.id)
      }
    }
  }

  createEffect(() => {
    const map = props.ptyMap
    for (const leafId of [...pendingPtyRequests]) {
      if (map[leafId]) pendingPtyRequests.delete(leafId)
    }
  })

  createEffect(on(
    () => findAllLeaves(gridStore.root).length,
    () => setTimeout(autoCreatePtys, 50),
    { defer: true }
  ))

  // Stable cell list — reconcile by id so <For> keeps existing terminals alive
  const [cells, setCells] = createStore<CellLayout[]>([])

  createEffect(() => {
    const layouts = computeCellLayouts(gridStore.root)
    setCells(reconcile(layouts, { key: 'id', merge: true }))
  })

  // Resizers recomputed freely (lightweight divs, no terminal state)
  const resizers = () => computeResizerLayouts(gridStore.root)

  return (
    <div class="w-full h-full overflow-hidden relative">
      {/* Terminal cells — stable, keyed by id, never re-mounted */}
      <For each={cells}>
        {(cell) => (
          <div
            style={{
              position: 'absolute',
              left: `${cell.x * 100}%`,
              top: `${cell.y * 100}%`,
              width: `${cell.w * 100}%`,
              height: `${cell.h * 100}%`,
              overflow: 'hidden',
            }}
          >
            <GridCell
              node={cell.node}
              ptyId={props.ptyMap[cell.id]}
              onRequestPty={props.onRequestPty}
              onSplit={autoCreatePtys}
            />
          </div>
        )}
      </For>

      {/* Resizers — lightweight, re-render freely */}
      <For each={resizers()}>
        {(r) => (
          <div
            style={{
              position: 'absolute',
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: r.direction === 'horizontal' ? '0' : `${r.w * 100}%`,
              height: r.direction === 'vertical' ? '0' : `${r.h * 100}%`,
              'z-index': '10',
            }}
          >
            <GridResizer
              direction={r.direction}
              onResize={(delta) => {
                const container = r.direction === 'horizontal'
                  ? document.querySelector('main')?.clientWidth || 800
                  : document.querySelector('main')?.clientHeight || 600
                const pctDelta = delta / container
                const parent = findNode(gridStore.root, r.nodeId)
                if (!parent?.ratios) return
                const newRatios = [...parent.ratios]
                newRatios[r.index] = Math.max(0.1, newRatios[r.index] + pctDelta)
                newRatios[r.index + 1] = Math.max(0.1, newRatios[r.index + 1] - pctDelta)
                updateRatios(r.nodeId, newRatios)
              }}
            />
          </div>
        )}
      </For>
    </div>
  )
}

export default GridContainer
