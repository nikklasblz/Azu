import { Component } from 'solid-js'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'
import { win } from '../../lib/tauri-commands'

const TitleBar: Component = () => {
  return (
    <header
      class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0 gap-4 select-none"
      data-tauri-drag-region
    >
      <span class="font-bold text-accent text-sm">Azu</span>
      <button
        class="px-2 py-1 text-xs border border-border rounded hover:bg-surface text-text-muted"
        onClick={() => win.create('Azu')}
        title="Open new window"
      >
        + Window
      </button>
      <PresetSwitcher />
      <div class="flex-1" data-tauri-drag-region />
      <ThemePicker />
    </header>
  )
}

export default TitleBar
