import { loadPreset, gridStore } from '../stores/grid'

export function initKeybindings() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const presetNames = Object.keys(gridStore.presets)
      const index = parseInt(e.key) - 1
      if (index < presetNames.length) {
        loadPreset(presetNames[index])
      }
    }
  })
}
