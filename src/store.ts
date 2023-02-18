import { useEffect, useMemo, useState } from 'react'
import { getImageDataByIds } from './api'
import { Texture, uploadSubTexture, uploadTexture } from './gl'
import { GLContext, GraphicsDrawCommand } from './graphics'
import { Point, Rectangle } from './types'
import { measureTime, useQuery } from './util'

export interface DrawCommand {
  id: string
  x: number
  y: number
  w: number
  h: number
}

interface TextureAtlas {
  texture: Texture
  mapping: Map<string, Rectangle>
}

export function useTextureStore(
  glContext: GLContext | undefined,
  viewport: Rectangle,
  drawCommands: DrawCommand[],
): GraphicsDrawCommand[] {
  const [graphicsDrawCommands, setGraphicsDrawCommands] = useState<GraphicsDrawCommand[]>([])

  const [baseAtlas] = useQuery<TextureAtlas | undefined>(
    async () => {
      if (!glContext) return

      const req = drawCommands
        .map(dc => {
          return {
            id: dc.id,
            max_width: 1000,
            max_height: 1000,
          }
        })
        .slice(0, 10)

      const resp = await getImageDataByIds(req)
      const zipped: [DrawCommand, ImageBitmap | undefined][] = drawCommands.map(function (e, i) {
        return [e, resp[i]]
      })

      const filtered = zipped.filter(([_a, a]) => a) as [DrawCommand, ImageBitmap][]

      const total_area = filtered.map(([_a, a]) => a.width * a.height).reduce((p, c) => p + c, 0)
      const row_width = Math.sqrt(total_area)

      const sorted = filtered.sort(([_a, a], [_b, b]) => {
        if (!a) return -1000
        if (!b) return 1000

        return a.height - b.height
      })

      let buf_width = row_width
      let buf_height = 0
      let start_x = 0
      let start_y = 0
      let row_height = 0

      const atlas_mapping = new Map<string, Rectangle>()
      const texture_mapping = new Map<string, ImageBitmap>()

      for (const [dc, texture] of filtered) {
        if (!texture) continue

        if (start_x > 0 && start_x + texture.width > row_width) {
          start_x = 0
          start_y += row_height
          buf_height += row_height
          row_height = 0
        }

        buf_width = Math.max(buf_width, start_x + texture.width)
        row_height = Math.max(row_height, texture.height)

        const mapping = new Rectangle(start_x, start_y, texture.width, texture.height)
        atlas_mapping.set(dc.id, mapping)
        texture_mapping.set(dc.id, texture)

        start_x += texture.width
      }
      buf_height += row_height

      // TODO: handle errors
      const texture = glContext.gl.createTexture()!
      const phantom_data = measureTime('generating phantom data', 1, () => new ImageData(buf_width, buf_height))
      uploadTexture(glContext.gl, phantom_data, texture)

      for (const id of atlas_mapping.keys()) {
        const mapping = atlas_mapping.get(id)!
        const image = texture_mapping.get(id)!

        uploadSubTexture(glContext.gl, image, texture, new Point(mapping.x, mapping.y))
      }
      return {
        texture: {
          texture,
          width: buf_width,
          height: buf_height,
        },
        mapping: atlas_mapping,
      }
    },
    undefined,
    [glContext],
  )

  useEffect(() => {
    if (!baseAtlas) return

    const graphicsDrawCommands = drawCommands
      .map(dc => {
        const mapping = baseAtlas.mapping.get(dc.id)
        if (!mapping) return

        return {
          texture: baseAtlas.texture,
          src: mapping,
          dst: new Rectangle(dc.x, dc.y, dc.w, dc.h),
        }
      })
      .filter(a => a) as GraphicsDrawCommand[]

    console.log(graphicsDrawCommands)

    setGraphicsDrawCommands(graphicsDrawCommands)
  }, [baseAtlas, drawCommands])

  return graphicsDrawCommands
  // return useMemo(() => {
  //   return []
  // }, [])
}
