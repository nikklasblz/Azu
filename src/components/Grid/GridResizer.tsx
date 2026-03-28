import { Component, createSignal } from 'solid-js'

interface GridResizerProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
}

const GridResizer: Component<GridResizerProps> = (props) => {
  const [dragging, setDragging] = createSignal(false)

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    let lastPos = props.direction === 'horizontal' ? e.clientX : e.clientY

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = props.direction === 'horizontal' ? e.clientX : e.clientY
      props.onResize(currentPos - lastPos)
      lastPos = currentPos
    }

    const handleMouseUp = () => {
      setDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const cursorClass = () => props.direction === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'
  const sizeClass = () => props.direction === 'horizontal' ? 'w-1 h-full' : 'h-1 w-full'

  return (
    <div
      class={`${sizeClass()} ${cursorClass()} bg-border hover:bg-accent transition-colors shrink-0 ${dragging() ? 'bg-accent' : ''}`}
      onMouseDown={handleMouseDown}
    />
  )
}

export default GridResizer
