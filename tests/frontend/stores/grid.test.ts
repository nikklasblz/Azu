import { describe, it, expect, beforeEach } from 'vitest'
import {
  gridStore,
  removeCell,
  splitHorizontal,
  splitVertical,
  savePreset,
  loadPreset,
  resetGrid,
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
})
