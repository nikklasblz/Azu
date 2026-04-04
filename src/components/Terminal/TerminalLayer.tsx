// TerminalLayer — renders all terminals in a STABLE container
// Terminals are positioned absolutely to overlay their grid cell slots
// Grid changes NEVER destroy terminals — only position updates happen

import { Component, For, createEffect, onCleanup } from 'solid-js'
import TerminalComponent from './Terminal'

interface TerminalEntry {
  ptyId: string
  cellId: string
}

interface TerminalLayerProps {
  entries: TerminalEntry[]
  containerRef: HTMLElement | undefined
}

const TerminalLayer: Component<TerminalLayerProps> = (props) => {
  return (
    <For each={props.entries}>
      {(entry) => {
        let wrapperRef: HTMLDivElement | undefined

        // Position this terminal over its grid cell slot
        const updatePosition = () => {
          if (!wrapperRef || !props.containerRef) return
          const slot = props.containerRef.querySelector(`[data-cell-id="${entry.cellId}"]`) as HTMLElement
          if (!slot) return
          const containerRect = props.containerRef.getBoundingClientRect()
          const slotRect = slot.getBoundingClientRect()
          wrapperRef.style.left = `${slotRect.left - containerRect.left}px`
          wrapperRef.style.top = `${slotRect.top - containerRect.top}px`
          wrapperRef.style.width = `${slotRect.width}px`
          wrapperRef.style.height = `${slotRect.height}px`
        }

        // Update position when grid changes
        createEffect(() => {
          // Track grid changes by reading entries list length
          void props.entries.length
          requestAnimationFrame(updatePosition)
        })

        // ResizeObserver to keep position in sync
        let resizeObs: ResizeObserver | undefined
        createEffect(() => {
          if (props.containerRef && !resizeObs) {
            resizeObs = new ResizeObserver(() => updatePosition())
            resizeObs.observe(props.containerRef)
            onCleanup(() => resizeObs?.disconnect())
          }
        })

        // Also update on window resize
        const onResize = () => updatePosition()
        window.addEventListener('resize', onResize)
        onCleanup(() => window.removeEventListener('resize', onResize))

        return (
          <div
            ref={wrapperRef}
            style={{
              position: 'absolute',
              'z-index': '1',
              overflow: 'hidden',
            }}
          >
            <TerminalComponent ptyId={entry.ptyId} />
          </div>
        )
      }}
    </For>
  )
}

export default TerminalLayer
