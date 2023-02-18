import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { GLData, Texture, initGLData, updateBuffers, draw, DrawParams } from './gl'
import { Rectangle } from './types'

// TODO: fix rescaling on resize
export function useViewport(): [Rectangle, Dispatch<SetStateAction<Rectangle>>] {
  const size = useRef([window.innerWidth, window.innerHeight])
  const [viewport, setViewport] = useState<Rectangle>(
    new Rectangle(0, 0, window.innerWidth, window.innerHeight),
  )

  useEffect(() => {
    const updateSize = () => {
      setViewport(viewport => {
        const { innerWidth, innerHeight } = window
        const [width, height] = size.current

        if (width === innerWidth && height === innerHeight) return viewport

        size.current = [innerWidth, innerHeight]

        return Rectangle.fromCenter(
          viewport.getCenter(),
          (viewport.w * window.innerWidth) / width,
          (viewport.h * window.innerHeight) / height,
        )
      })
    }

    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  return [viewport, setViewport]
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
