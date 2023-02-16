import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { ApiImageAtlasMapping } from './api'
import { GLData, Texture, initGLData, uploadTexture } from './gl'
import { Rectangle } from './types'
import { measureTime, measureTimeCallback } from './util'

// TODO: fix rescaling on resize
export function useViewport(): [Rectangle, Dispatch<SetStateAction<Rectangle>>] {
  const size = useRef([window.innerWidth, window.innerHeight])
  const [viewport, setViewport] = useState<Rectangle>(new Rectangle(0, 0, window.innerWidth, window.innerHeight))

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

export interface TextureAtlas {
  mapping: ApiImageAtlasMapping[]
  width: number
  height: number
}

interface InternalTextureAtlas {
  mapping: Map<string, ApiImageAtlasMapping>
  width: number
  height: number
}

export interface DrawCommand {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface GraphicsDrawCommand {
  texture: Texture
  src: Rectangle
  dst: Rectangle
}

export function useGraphics(
  canvas: HTMLCanvasElement | null,
  drawCommands: DrawCommand[],
  viewport: Rectangle,
): {
  gl: WebGL2RenderingContext | null
  glData: GLData | null
  loadTexture: (source: TexImageSource, atlas: TextureAtlas) => void
} {
  const [gl, glData] = useMemo(() => {
    if (canvas == null) return [null, null]

    const gl = canvas.getContext('webgl2')
    if (gl == null)
      throw Error('Your browser is not supported')

    return [gl, initGLData(gl)]
  }, [canvas])

  const vertexCount = useRef<number>(0)

  const [textureAtlas, setTextureAtlas] = useState<InternalTextureAtlas>()

  function loadTexture(source: TexImageSource, atlas: TextureAtlas) {
    if (gl == null || glData == null) return

    uploadTexture(gl, source, glData.texture)

    // build id->mapping structure
    const mapping: Map<string, ApiImageAtlasMapping> = new Map()
    for (const m of atlas.mapping) {
      mapping.set(m.id, m)
    }

    setTextureAtlas({
      mapping,
      width: atlas.width,
      height: atlas.height,
    })
  }

  // useEffect(updateBuffers, [gl, glData, textureAtlas, drawCommands])

  // useEffect(draw, [draw, gl, glData, viewport, canvas?.width, canvas?.height, drawCommands])

  return { gl, glData, loadTexture }
}
