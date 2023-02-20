import React, { useRef, useMemo } from 'react'
import { getImageMetadata } from './api'
import { useGLContext, useGraphics, useViewport } from './graphics'
import { createGridLayout } from './layout'
import { useKeyboardMovement } from './movement'
import { useTextureStore } from './store'
import { measureTimeAsync, useQuery } from './util'

const App = () => {
  const ref = useRef<HTMLCanvasElement>(null)

  const { viewport, setViewport, screen } = useViewport(ref.current)
  useKeyboardMovement(setViewport)

  const [metadata] = useQuery(
    () => measureTimeAsync('fetching metadata', 1, getImageMetadata()),
    [],
  )

  const glContext = useGLContext(ref.current)
  const layout = useMemo(() => createGridLayout(metadata), [metadata])
  const graphicsDrawCommands = useTextureStore(glContext, viewport, layout, metadata)
  useGraphics(glContext, graphicsDrawCommands, viewport)

  return <canvas ref={ref} width={window.innerWidth} height={window.innerHeight} />
}

export default App
