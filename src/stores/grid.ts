import { createStore, produce, reconcile, unwrap } from 'solid-js/store'
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
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({
    id: genId(),
    type: 'row' as const,
    children: [{ ...node }, createLeaf(node.cwd)],
    ratios: [0.5, 0.5],
  }))
  setGridStore('root', reconcile(newRoot))
}

export function splitVertical(cellId: string) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({
    id: genId(),
    type: 'column' as const,
    children: [{ ...node }, createLeaf(node.cwd)],
    ratios: [0.5, 0.5],
  }))
  setGridStore('root', reconcile(newRoot))
}

export function removeCell(cellId: string) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const parent = findParent(raw, cellId)
  if (!parent || !parent.children) return
  const remaining = parent.children.find((c) => c.id !== cellId)
  if (!remaining) return
  const newRoot = findAndReplace(raw, parent.id, () => ({
    ...remaining,
  }))
  setGridStore('root', reconcile(newRoot))
}

export function savePreset(name: string) {
  setGridStore('presets', name, deepClone(gridStore.root))
  setGridStore('activePreset', name)
  persistPresets()
}

export function loadPreset(name: string) {
  const preset = gridStore.presets[name]
  if (preset) {
    setGridStore('root', reconcile(deepClone(preset)))
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
  setGridStore('root', createLeaf())
  setGridStore('activePreset', null)
}

export function updateRatios(nodeId: string, ratios: number[]) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, nodeId, (node) => ({ ...node, ratios }))
  setGridStore('root', reconcile(newRoot))
}

export function setCellLabel(cellId: string, label: string) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({ ...node, label }))
  setGridStore('root', reconcile(newRoot))
}

export function setCellTheme(cellId: string, themeId: string) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({ ...node, themeId }))
  setGridStore('root', reconcile(newRoot))
}

export function setCellFont(cellId: string, fontFamily: string) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({ ...node, fontFamily }))
  setGridStore('root', reconcile(newRoot))
}

export function setCellCwd(cellId: string, cwd: string) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({ ...node, cwd }))
  setGridStore('root', reconcile(newRoot))
}

export function swapCells(idA: string, idB: string) {
  if (idA === idB) return
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const nodeA = findNode(raw, idA)
  const nodeB = findNode(raw, idB)
  if (!nodeA || !nodeB) return
  const copyA = { ...nodeA }
  const copyB = { ...nodeB }
  let result = findAndReplace(raw, idA, () => ({ ...copyB, id: idA }))
  result = findAndReplace(result, idB, () => ({ ...copyA, id: idB }))
  setGridStore('root', reconcile(result))
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
