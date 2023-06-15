import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Texture, initProgram, updateBuffers, draw, ProgramData } from './gl'
import { Point, Rectangle } from './types'

export interface ViewportFunctions {
  viewportToScreenCoord: (p: Point) => Point
  viewportToScreenRect: (r: Rectangle) => Rectangle
  screenToViewportCoord: (p: Point) => Point
  screenToViewportRect: (r: Rectangle) => Rectangle
}

export type Viewport = {
  viewport: Rectangle
  setViewport: React.Dispatch<React.SetStateAction<Rectangle>>
} & ViewportFunctions

export const useViewport = (canvas: HTMLCanvasElement | null) => {
  const screen: React.MutableRefObject<[number, number]> = useRef([
    window.innerWidth,
    window.innerHeight,
  ])
  const [viewport, setViewport] = useState<Rectangle>(
    new Rectangle(0, 0, screen.current[0], screen.current[1]),
  )

  const updateSize = useCallback(() => {
    if (!canvas) return

    const [prevWidth, prevHeight] = screen.current
    const { innerWidth, innerHeight } = window
    screen.current = [innerWidth, innerHeight]

    setViewport(viewport =>
      Rectangle.fromCenter(
        viewport.getCenter(),
        (viewport.w * innerWidth) / prevWidth,
        (viewport.h * innerHeight) / prevHeight,
      ),
    )
  }, [canvas])

  useEffect(() => {
    if (!canvas) return

    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [canvas])

  const viewportToScreenCoord = (p: Point) => {
    const basePoint = viewport.getBasePoint()
    return p
      .translate(-basePoint.x, -basePoint.y)
      .scale(screen.current[0] / viewport.w, screen.current[1] / viewport.h)
  }

  const viewportToScreenRect = (r: Rectangle) => {
    const basePoint = viewportToScreenCoord(r.getBasePoint())
    const offsetPoint = viewportToScreenCoord(r.getOffsetPoint())
    return Rectangle.fromOppositeCorners(basePoint, offsetPoint)
  }

  const screenToViewportCoord = (p: Point) => {
    const basePoint = viewport.getBasePoint()
    return p
      .scale(viewport.w / screen.current[0], viewport.h / screen.current[1])
      .translate(basePoint.x, basePoint.y)
  }

  const screenToViewportRect = (r: Rectangle) => {
    const basePoint = screenToViewportCoord(r.getBasePoint())
    const offsetPoint = screenToViewportCoord(r.getOffsetPoint())
    return Rectangle.fromOppositeCorners(basePoint, offsetPoint)
  }

  return {
    viewport,
    setViewport,
    viewportToScreenCoord,
    viewportToScreenRect,
    screenToViewportCoord,
    screenToViewportRect,
  }
}

export interface GLContext {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  programData: ProgramData
}

export function useGLContext(canvas: HTMLCanvasElement | null): GLContext | undefined {
  return useMemo(() => {
    if (canvas == null) return

    const gl = canvas.getContext('webgl2')
    if (gl == null) throw Error('Your browser is not supported')

    const programData = initProgram(gl)
    if (programData == null) throw Error('Could not initialize OpenGL buffers')

    return {
      gl,
      canvas,
      programData,
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
  const [drawParams, setDrawParams] = useState<Texture[]>([])

  useEffect(() => {
    if (!glContext) return

    const newDrawParams = updateBuffers(glContext.gl, drawCommands)

    // NOTE: short pause after buffer gen seems to solve an issue
    setTimeout(() => setDrawParams(newDrawParams), 10)
  }, [drawCommands, glContext])

  useEffect(() => {
    if (!glContext) return

    draw(glContext.gl, glContext.programData, drawParams, glContext.canvas, viewport)
  }, [glContext, viewport, glContext?.canvas?.width, glContext?.canvas?.height, drawCommands])
}
