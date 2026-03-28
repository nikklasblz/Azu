import { Component } from 'solid-js'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'

const TitleBar: Component = () => {
  return (
    <header
      class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0 gap-4 select-none"
      data-tauri-drag-region
    >
      <span class="font-bold text-accent text-sm">Azu</span>
      <PresetSwitcher />
      <div class="flex-1" data-tauri-drag-region />
      <ThemePicker />
    </header>
  )
}

export default TitleBar
