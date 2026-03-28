import { Component, createMemo } from 'solid-js'
import { gridStore } from '../../stores/grid'
import { themeStore } from '../../stores/theme'

function countLeaves(node: any): number {
  if (node.type === 'leaf') return 1
  return (node.children || []).reduce((acc: number, c: any) => acc + countLeaves(c), 0)
}

const StatusBar: Component = () => {
  const paneCount = createMemo(() => countLeaves(gridStore.root))

  return (
    <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted shrink-0 gap-4 select-none">
      <span class="text-success">● Ready</span>
      <span>{paneCount()} pane{paneCount() > 1 ? 's' : ''}</span>
      <span>{gridStore.activePreset || 'No preset'}</span>
      <div class="flex-1" />
      <span>{themeStore.activeId}</span>
      <span>UTF-8</span>
    </footer>
  )
}

export default StatusBar
