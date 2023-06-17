import React, { useEffect, useRef } from 'react'
import { App as LibApp } from './lib/app'

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<LibApp>()

  useEffect(() => {
    if (canvasRef.current === null || appRef.current !== undefined) return

    appRef.current = new LibApp(canvasRef.current)
  }, [canvasRef.current])

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      style={{ maxWidth: '100vw', maxHeight: '100vh' }}
    />
  )
}

export default App
