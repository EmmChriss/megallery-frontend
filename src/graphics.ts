import { useEffect, useMemo, useRef, useState } from 'react'
import { GLData, Texture, initGLData, updateBuffers, draw, DrawParams } from './gl'
import { Rectangle } from './types'

export const useViewport = (canvas: HTMLCanvasElement | null) => {
  const screen: React.MutableRefObject<[number, number]> = useRef([
    window.innerWidth,
    window.innerHeight,
  ])
  const [viewport, setViewport] = useState<Rectangle>(
    new Rectangle(0, 0, screen.current[0], screen.current[1]),
  )

  useEffect(() => {
    if (!canvas) return

    const updateSize = () => {
      const [prevWidth, prevHeight] = screen.current
      const { width, height } = canvas.getBoundingClientRect()
      screen.current = [width, height]

      setViewport(viewport =>
        Rectangle.fromCenter(
          viewport.getCenter(),
          (viewport.w * width) / prevWidth,
          (viewport.h * height) / prevHeight,
        ),
      )
    }

    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [canvas])

  return { viewport, setViewport, screen: screen.current }
}

export interface GLContext {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  glData: GLData
}

export function useGLContext(canvas: HTMLCanvasElement | null): GLContext | undefined {
  return useMemo(() => {
    if (canvas == null) return

    const gl = canvas.getContext('webgl2')
    if (gl == null) throw Error('Your browser is not supported')

    const glData = initGLData(gl)
    if (glData == null) throw Error('Could not initialize OpenGL buffers')

    return {
      gl,
      canvas,
      glData,
    }
  }, [canvas])
}

export interface GraphicsDrawCommand {
  texture: Texture
  src: Rectangle
  dst: Rectangle
}

export function useGraphics(
  glContext: GLContext | undefined,
  drawCommands: GraphicsDrawCommand[],
  viewport: Rectangle,
) {
  const [drawParams, setDrawParams] = useState<DrawParams[]>([])

  useEffect(() => {
    if (!glContext) return

    setDrawParams(updateBuffers(glContext.gl, glContext.glData, drawCommands))
  }, [drawCommands, glContext])

  useEffect(() => {
    if (!glContext) return

    draw(glContext.gl, glContext.glData, drawParams, glContext.canvas, viewport)
  }, [glContext, viewport, glContext?.canvas?.width, glContext?.canvas?.height, drawCommands])
}
