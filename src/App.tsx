import React, { useRef, useMemo } from 'react'
import { getImageMetadata } from './api'
import { useGLContext, useGraphics, useViewport } from './graphics'
import { createGridLayout } from './layout'
import { useKeyboardMovement } from './movement'
import { useTextureStore } from './store'
import { measureTimeAsync, useQuery } from './util'

const App = () => {
  const ref = useRef<HTMLCanvasElement>(null)

  const [metadata] = useQuery(
    () => measureTimeAsync('fetching metadata', 1, getImageMetadata()),
    [],
  )
  const [viewport, setViewport] = useViewport()
  const layout = useMemo(() => createGridLayout(metadata), [metadata])
  const glContext = useGLContext(ref.current)
  const graphicsDrawCommands = useTextureStore(glContext, viewport, layout)
  useGraphics(glContext, graphicsDrawCommands, viewport)
  useKeyboardMovement(setViewport)

  return <canvas ref={ref} width={window.innerWidth} height={window.innerHeight} />
}

export default App
