import { createStore, produce } from 'solid-js/store'
import { config } from '../lib/tauri-commands'

export interface GridNode {
  id: string
  type: 'leaf' | 'row' | 'column'
  panelType?: 'terminal' | 'ai' | 'project' | 'empty'
  children?: GridNode[]
  ratios?: number[]
  label?: string
  themeId?: string
  fontFamily?: string
  cwd?: string
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

function createLeaf(cwd?: string): GridNode {
  return { id: genId(), type: 'leaf', panelType: 'terminal', cwd }
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
      id: genId(),
      type: 'row' as const,
      children: [{ ...node }, createLeaf(node.cwd)],
      ratios: [0.5, 0.5],
    }))
  )
}

export function splitVertical(cellId: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({
      id: genId(),
      type: 'column' as const,
      children: [{ ...node }, createLeaf(node.cwd)],
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
  persistPresets()
}

export function loadPreset(name: string) {
  const preset = gridStore.presets[name]
  if (preset) {
    setGridStore('root', deepClone(preset))
    setGridStore('activePreset', name)
  }
}

export function deletePreset(name: string) {
  setGridStore(produce((state) => {
    delete state.presets[name]
    if (state.activePreset === name) {
      state.activePreset = null
    }
  }))
  persistPresets()
}

// Persist presets to disk so all windows share them
function persistPresets() {
  const data = JSON.stringify(gridStore.presets)
  config.save('layout-presets', data).catch(() => {})
}

// Load presets from disk — call on app init
export async function loadPresetsFromDisk() {
  try {
    const data = await config.load('layout-presets')
    if (data) {
      const presets = JSON.parse(data) as Record<string, GridNode>
      for (const [name, node] of Object.entries(presets)) {
        setGridStore('presets', name, node)
      }
    }
  } catch {
    // First run or corrupted — ignore
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

export function setCellLabel(cellId: string, label: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({ ...node, label }))
  )
}

export function setCellTheme(cellId: string, themeId: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({ ...node, themeId }))
  )
}

export function setCellFont(cellId: string, fontFamily: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({ ...node, fontFamily }))
  )
}

export function setCellCwd(cellId: string, cwd: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({ ...node, cwd }))
  )
}

export function swapCells(idA: string, idB: string) {
  if (idA === idB) return
  setGridStore('root', (root) => {
    const nodeA = findNode(root, idA)
    const nodeB = findNode(root, idB)
    if (!nodeA || !nodeB) return root
    // Swap by replacing A with B's content and B with A's content
    const copyA = { ...nodeA }
    const copyB = { ...nodeB }
    let result = findAndReplace(root, idA, () => ({ ...copyB, id: idA }))
    result = findAndReplace(result, idB, () => ({ ...copyA, id: idB }))
    return result
  })
}

export function findAllLeaves(node: GridNode): GridNode[] {
  if (node.type === 'leaf') return [node]
  return (node.children || []).flatMap(findAllLeaves)
}

export function findNode(node: GridNode, id: string): GridNode | null {
  if (node.id === id) return node
  if (!node.children) return null
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

export { gridStore, setGridStore }
