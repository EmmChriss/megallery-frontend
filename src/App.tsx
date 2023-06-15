import React, { useRef, useMemo } from 'react'
import { ApiImage, getImageMetadata } from './api'
import { useGLContext, useGraphics, useViewport } from './graphics'
import { createGridLayout, createLineLayout, Layout, useLayout } from './layout'
import { useKeyboardLayoutSwitcher, useKeyboardMovement } from './movement'
import { useTextureStore } from './store'
import { measureTimeAsync, useQuery } from './util'

const App = () => {
  const ref = useRef<HTMLCanvasElement>(null)

  const viewport = useViewport(ref.current)
  useKeyboardMovement(viewport.setViewport)

  const [metadata] = useQuery(
    () => measureTimeAsync('fetching metadata', 1, getImageMetadata()),
    [],
  )
  const glContext = useGLContext(ref.current)
  const [drawCommands, setLayout] = useLayout(metadata)

  const layouts: Layout<ApiImage>[] = useMemo(
    () => [
      m => createGridLayout(m, undefined),
      m => createLineLayout(m, { direction: 'vertical' }),
      m => createLineLayout(m, { direction: 'horizontal' }),
    ],
    [],
  )

  useKeyboardLayoutSwitcher(setLayout, layouts)

  const graphicsDrawCommands = useTextureStore(glContext, viewport, drawCommands, metadata)

  useGraphics(glContext, graphicsDrawCommands, viewport.viewport)

  return <canvas ref={ref} width={window.innerWidth} height={window.innerHeight} />
}

export default App
