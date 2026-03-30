import { loadPreset, gridStore, splitHorizontal, splitVertical, removeCell, findAllLeaves } from '../stores/grid'

interface KeybindingCallbacks {
  addTab: () => void
  closeTab: (tabId: string) => void
  getActiveTabId: () => string
}

let callbacks: KeybindingCallbacks | null = null

export function initKeybindings(cbs: KeybindingCallbacks) {
  callbacks = cbs

  document.addEventListener('keydown', (e) => {
    // Alt+1-9: load preset by index
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const presetNames = Object.keys(gridStore.presets)
      const index = parseInt(e.key) - 1
      if (index < presetNames.length) {
        loadPreset(presetNames[index])
      }
      return
    }

    // Ctrl+T: new tab
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault()
      callbacks?.addTab()
      return
    }

    // Ctrl+W: close active pane (if multiple) or close tab (if single pane)
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault()
      const leaves = findAllLeaves(gridStore.root)
      if (leaves.length > 1) {
        // Close the last leaf (most recently split)
        removeCell(leaves[leaves.length - 1].id)
      }
      return
    }

    // Ctrl+Shift+H: split horizontal
    if (e.ctrlKey && e.shiftKey && e.key === 'H') {
      e.preventDefault()
      const leaves = findAllLeaves(gridStore.root)
      if (leaves.length > 0) {
        splitHorizontal(leaves[leaves.length - 1].id)
      }
      return
    }

    // Ctrl+Shift+V: split vertical
    if (e.ctrlKey && e.shiftKey && e.key === 'V') {
      e.preventDefault()
      const leaves = findAllLeaves(gridStore.root)
      if (leaves.length > 0) {
        splitVertical(leaves[leaves.length - 1].id)
      }
      return
    }
  })
}
