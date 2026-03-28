import { createStore } from 'solid-js/store'

export interface GridNode {
  id: string
  type: 'leaf' | 'row' | 'column'
  panelType?: 'terminal' | 'ai' | 'project' | 'empty'
  children?: GridNode[]
  ratios?: number[]
}

interface GridState {
  root: GridNode
  presets: Record<string, GridNode>
  activePreset: string | null
}

let nextId = 1
function genId(): string {
  return `cell-${nextId++}`
}

function createLeaf(): GridNode {
  return { id: genId(), type: 'leaf', panelType: 'terminal' }
}

function deepClone(node: GridNode): GridNode {
  return JSON.parse(JSON.stringify(node))
}

const initialRoot = createLeaf()

const [gridStore, setGridStore] = createStore<GridState>({
  root: initialRoot,
  presets: {},
  activePreset: null,
})

function findAndReplace(
  node: GridNode,
  targetId: string,
  replacer: (node: GridNode) => GridNode
): GridNode {
  if (node.id === targetId) return replacer(node)
  if (!node.children) return node
  return {
    ...node,
    children: node.children.map((c) => findAndReplace(c, targetId, replacer)),
  }
}

function findParent(node: GridNode, targetId: string): GridNode | null {
  if (!node.children) return null
  for (const child of node.children) {
    if (child.id === targetId) return node
    const found = findParent(child, targetId)
    if (found) return found
  }
  return null
}

export function splitHorizontal(cellId: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({
      id: node.id,
      type: 'row' as const,
      children: [createLeaf(), createLeaf()],
      ratios: [0.5, 0.5],
    }))
  )
}

export function splitVertical(cellId: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({
      id: node.id,
      type: 'column' as const,
      children: [createLeaf(), createLeaf()],
      ratios: [0.5, 0.5],
    }))
  )
}

export function removeCell(cellId: string) {
  setGridStore('root', (root) => {
    const parent = findParent(root, cellId)
    if (!parent || !parent.children) return root
    const remaining = parent.children.find((c) => c.id !== cellId)
    if (!remaining) return root
    return findAndReplace(root, parent.id, () => ({
      ...remaining,
    }))
  })
}

export function savePreset(name: string) {
  setGridStore('presets', name, deepClone(gridStore.root))
  setGridStore('activePreset', name)
}

export function loadPreset(name: string) {
  const preset = gridStore.presets[name]
  if (preset) {
    setGridStore('root', deepClone(preset))
    setGridStore('activePreset', name)
  }
}

export function resetGrid() {
  nextId = 1
  setGridStore('root', createLeaf())
  setGridStore('activePreset', null)
}

export function updateRatios(nodeId: string, ratios: number[]) {
  setGridStore('root', (root) =>
    findAndReplace(root, nodeId, (node) => ({ ...node, ratios }))
  )
}

// Note: addCell is not used in the test but exported for API completeness
export function addCell() {
  // placeholder for future use
}

export { gridStore }
