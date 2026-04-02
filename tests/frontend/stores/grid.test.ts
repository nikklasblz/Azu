import { describe, it, expect, beforeEach } from 'vitest'
import {
  gridStore,
  removeCell,
  splitHorizontal,
  splitVertical,
  savePreset,
  loadPreset,
  resetGrid,
  swapCells,
  setCellLabel,
  setCellCwd,
  setCellTheme,
  updateRatios,
  findAllLeaves,
  findNode,
} from '../../../src/stores/grid'

describe('Grid Store', () => {
  beforeEach(() => {
    resetGrid()
  })

  it('starts with a single root cell', () => {
    expect(gridStore.root).not.toBeNull()
    expect(gridStore.root.type).toBe('leaf')
  })

  it('splits a cell horizontally', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    expect(gridStore.root.type).toBe('row')
    expect(gridStore.root.children).toHaveLength(2)
    expect(gridStore.root.children![0].type).toBe('leaf')
    expect(gridStore.root.children![1].type).toBe('leaf')
  })

  it('splits a cell vertically', () => {
    const rootId = gridStore.root.id
    splitVertical(rootId)
    expect(gridStore.root.type).toBe('column')
    expect(gridStore.root.children).toHaveLength(2)
  })

  it('removes a cell and collapses parent', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    const secondChild = gridStore.root.children![1]
    removeCell(secondChild.id)
    expect(gridStore.root.type).toBe('leaf')
  })

  it('saves and loads a preset', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    savePreset('dev')
    resetGrid()
    expect(gridStore.root.type).toBe('leaf')
    loadPreset('dev')
    expect(gridStore.root.type).toBe('row')
    expect(gridStore.root.children).toHaveLength(2)
  })

  it('supports nested splits', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    const firstChild = gridStore.root.children![0]
    splitVertical(firstChild.id)
    expect(gridStore.root.children![0].type).toBe('column')
    expect(gridStore.root.children![0].children).toHaveLength(2)
  })

  it('tracks ratios for resize', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    expect(gridStore.root.ratios).toEqual([0.5, 0.5])
  })

  // ── Edge case: Cell ID uniqueness across resets ──────────────────────────
  it('generates fresh IDs after resetGrid (no ID reuse)', () => {
    const idBefore = gridStore.root.id
    resetGrid()
    const idAfter = gridStore.root.id
    expect(idAfter).not.toBe(idBefore)
  })

  it('all leaf IDs remain unique across two resets', () => {
    const id1 = gridStore.root.id
    resetGrid()
    const id2 = gridStore.root.id
    resetGrid()
    const id3 = gridStore.root.id
    const ids = [id1, id2, id3]
    expect(new Set(ids).size).toBe(ids.length)
  })

  // ── Edge case: swapCells ─────────────────────────────────────────────────
  it('swaps content of two sibling cells', () => {
    splitHorizontal(gridStore.root.id)
    const leftId = gridStore.root.children![0].id
    const rightId = gridStore.root.children![1].id

    // Give each cell a distinct label so we can verify the swap
    setCellLabel(leftId, 'LEFT')
    setCellLabel(rightId, 'RIGHT')

    swapCells(leftId, rightId)

    // IDs stay in place; content moves
    const left = findNode(gridStore.root, leftId)
    const right = findNode(gridStore.root, rightId)
    expect(left?.label).toBe('RIGHT')
    expect(right?.label).toBe('LEFT')
  })

  it('swapCells is a no-op when both IDs are the same', () => {
    const rootId = gridStore.root.id
    setCellLabel(rootId, 'SOLO')
    swapCells(rootId, rootId)
    expect(findNode(gridStore.root, rootId)?.label).toBe('SOLO')
  })

  // ── Edge case: setCellLabel / setCellCwd / setCellTheme ──────────────────
  it('setCellLabel updates the label of the target cell', () => {
    const rootId = gridStore.root.id
    setCellLabel(rootId, 'My Terminal')
    expect(gridStore.root.label).toBe('My Terminal')
  })

  it('setCellLabel on a child cell does not affect sibling', () => {
    splitHorizontal(gridStore.root.id)
    const leftId = gridStore.root.children![0].id
    const rightId = gridStore.root.children![1].id
    setCellLabel(leftId, 'Left')
    expect(findNode(gridStore.root, rightId)?.label).toBeUndefined()
  })

  it('setCellCwd updates the working directory of the target cell', () => {
    const rootId = gridStore.root.id
    setCellCwd(rootId, '/home/user/projects')
    expect(gridStore.root.cwd).toBe('/home/user/projects')
  })

  it('setCellTheme updates the themeId of the target cell', () => {
    const rootId = gridStore.root.id
    setCellTheme(rootId, 'dracula')
    expect(gridStore.root.themeId).toBe('dracula')
  })

  it('setCellTheme on a nested cell leaves the parent unchanged', () => {
    splitHorizontal(gridStore.root.id)
    const childId = gridStore.root.children![0].id
    setCellTheme(childId, 'monokai')
    expect(gridStore.root.themeId).toBeUndefined()
    expect(findNode(gridStore.root, childId)?.themeId).toBe('monokai')
  })

  // ── Edge case: removeCell on root ────────────────────────────────────────
  it('removeCell on the root cell does nothing and does not throw', () => {
    const rootId = gridStore.root.id
    expect(() => removeCell(rootId)).not.toThrow()
    // Root should still be a leaf with the same ID
    expect(gridStore.root.id).toBe(rootId)
    expect(gridStore.root.type).toBe('leaf')
  })

  // ── Edge case: Double split → 3 leaves ──────────────────────────────────
  it('produces three leaves after splitting twice', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    // Split the first child of the new row
    const firstChildId = gridStore.root.children![0].id
    splitVertical(firstChildId)

    const leaves = findAllLeaves(gridStore.root)
    expect(leaves).toHaveLength(3)
    // Every collected node must be a leaf
    expect(leaves.every((n) => n.type === 'leaf')).toBe(true)
  })

  it('all leaf IDs are unique after a double split', () => {
    splitHorizontal(gridStore.root.id)
    splitVertical(gridStore.root.children![0].id)

    const leaves = findAllLeaves(gridStore.root)
    const ids = leaves.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // ── Edge case: updateRatios ──────────────────────────────────────────────
  it('updateRatios replaces ratios on the target split node', () => {
    splitHorizontal(gridStore.root.id)
    const splitNodeId = gridStore.root.id
    updateRatios(splitNodeId, [0.3, 0.7])
    expect(gridStore.root.ratios).toEqual([0.3, 0.7])
  })

  it('updateRatios on a nested split node does not affect the parent', () => {
    splitHorizontal(gridStore.root.id)
    const firstChildId = gridStore.root.children![0].id
    splitVertical(firstChildId)

    // The first child is now a column node
    const nestedColumnId = gridStore.root.children![0].id
    updateRatios(nestedColumnId, [0.25, 0.75])

    const nestedColumn = findNode(gridStore.root, nestedColumnId)
    expect(nestedColumn?.ratios).toEqual([0.25, 0.75])
    // Parent (row) ratios remain untouched
    expect(gridStore.root.ratios).toEqual([0.5, 0.5])
  })
})
