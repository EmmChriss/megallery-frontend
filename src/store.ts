import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiImage, ApiImageDataRequestV2Entry, getImageDataByIds } from './api'
import { Texture, uploadSubTexture, createTexture, clearTexture } from './gl'
import { GLContext, GraphicsDrawCommand, Viewport } from './graphics'
import { Point, Rectangle } from './types'
import { measureTime, measureTimeAsync, measureTimeCallback, useEq, useThrottledMemo } from './util'

export interface DrawCommand {
  id: string
  dst: Rectangle
}

interface TextureAtlas {
  texture: Texture
  mapping: Map<string, Rectangle>
}

async function queryAtlas(
  glContext: GLContext,
  req: ApiImageDataRequestV2Entry[],
): Promise<TextureAtlas> {
  const resp = await measureTimeAsync('awaiting response', 0, getImageDataByIds(req))

  const atlasGenClock = measureTimeCallback('atlas gen', 0)
  const zipped: [string, ImageBitmap | null][] = req.map(function (e, i) {
    return [e.id, resp[i]]
  })

  const filtered = zipped.filter(([_a, a]) => a) as [string, ImageBitmap][]

  const total_area = filtered.map(([_a, a]) => a.width * a.height).reduce((p, c) => p + c, 0)
  const row_width = Math.trunc(Math.sqrt(total_area))

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

  for (const [id, texture] of sorted) {
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
    atlas_mapping.set(id, mapping)
    texture_mapping.set(id, texture)

    start_x += texture.width
  }
  buf_height += row_height

  atlasGenClock()

  // TODO: handle errors
  const texture = createTexture(glContext.gl)
  if (!texture) throw new Error('could not initialize texture')

  measureTime('clearing texture', 0, () =>
    clearTexture(glContext.gl, texture, buf_width, buf_height),
  )

  measureTime('uploading textures', 0, () => {
    for (const id of atlas_mapping.keys()) {
      const mapping = atlas_mapping.get(id)!
      const image = texture_mapping.get(id)!

      uploadSubTexture(glContext.gl, image, texture.texture, new Point(mapping.x, mapping.y))
    }
  })
  return {
    texture,
    mapping: atlas_mapping,
  }
}

export function useTextureStore(
  glContext: GLContext | undefined,
  { viewport, viewportToScreenRect }: Viewport,
  layout: DrawCommand[],
  metadata: ApiImage[],
): GraphicsDrawCommand[] {
  const [atlases, setAtlases] = useState<TextureAtlas[]>([])

  const isDownloading: React.MutableRefObject<boolean> = useRef(false)
  async function loadAtlas(req: ApiImageDataRequestV2Entry[]) {
    if (!glContext || layout.length === 0 || isDownloading.current) return
    isDownloading.current = true

    const CUTOFF = 5000
    let remaining = [...req]
    const result = []
    while (remaining.length > 0) {
      const req = remaining.slice(0, CUTOFF)
      remaining = remaining.slice(CUTOFF)

      const newAtlas = await measureTimeAsync('building atlas', 1, queryAtlas(glContext, req))

      result.push(newAtlas)
      setAtlases([...atlases, newAtlas])
    }
    // setAtlases([...atlases, ...result])

    isDownloading.current = false
  }

  const benchmarkAtlas = async () => {
    const queryMetadata = metadata.map(m =>
      Object.assign({ id: m.id, max_width: 20, max_height: 20 }),
    )

    let size = 1000
    while (true) {
      if (size > 50000) {
        size = queryMetadata.length
      }

      const start = performance.now()
      // await measureTimeAsync(`loading base atlas of ${size}`, 1, loadAtlas(queryMetadata.slice(0, size)))
      await loadAtlas(queryMetadata.slice(0, size))
      console.warn(`loading base atlas of ${size} took ${performance.now() - start} ms`)

      if (size > 50000) {
        break
      }

      size *= 1.5

      await new Promise<void>((resolve, _reject) => setTimeout(resolve, 1_000))
    }
  }

  const idsInLayout = useMemo(() => new Set(layout.map(dc => dc.id)), [layout])
  const idsInLayoutEq = useEq(idsInLayout, (s1, s2) => [...s2.keys()].every(k => s1.has(k)))
  useEffect(() => {
    if (layout.length > 0 && glContext !== undefined) {
      void measureTimeAsync(
        'loading base atlas(es)',
        1,
        loadAtlas(
          metadata.map(m => {
            return { id: m.id, max_width: 20, max_height: 20 }
          }),
        ),
      )
      // void benchmarkAtlas()
    }
  }, [glContext, idsInLayoutEq])

  const lookupTexture = (id: string) => {
    for (let i = atlases.length - 1; i >= 0; i--) {
      const atlas = atlases[i]
      if (!atlas) continue

      const mapping = atlas.mapping.get(id)
      if (!mapping) continue

      return {
        texture: atlas.texture,
        src: mapping,
      }
    }
  }

  const [topLevel, layoutGrid, maxSize] = useMemo(() => {
    if (layout.length === 0) {
      return [new Rectangle(0, 0, 1, 1), []]
    }

    const [minX, minY, maxX, maxY, maxSize] = layout.reduce(
      ([minX, minY, maxX, maxY, maxSize], { dst }) => [
        Math.min(minX, dst.x),
        Math.min(minY, dst.y),
        Math.max(maxX, dst.x + dst.w),
        Math.max(maxY, dst.y + dst.h),
        Math.max(maxSize, Math.max(dst.w, dst.h)),
      ],
      [Infinity, Infinity, -Infinity, -Infinity, -Infinity],
    )

    const topLevel = new Rectangle(minX, minY, maxX - minX, maxY - minY)
    const grid: DrawCommand[][] = []

    for (const l of layout) {
      let currentRect = topLevel
      let newRect = currentRect
      let idx = 0
      do {
        currentRect = newRect

        const halfW = currentRect.w / 2
        const halfH = currentRect.h / 2
        const baseX = currentRect.x
        const baseY = currentRect.y

        const quadrants = [
          new Rectangle(baseX, baseY, halfW, halfH),
          new Rectangle(baseX + halfW, baseY, halfW, halfH),
          new Rectangle(baseX, baseY + halfH, halfW, halfH),
          new Rectangle(baseX + halfW, baseY + halfH, halfW, halfH),
        ]
        quadrants.forEach((q, i) => {
          // NOTE: primitive break
          if (newRect !== currentRect) return

          if (q.contains(l.dst)) {
            newRect = q
            idx = idx * 4 + i + 1
          }
        })
      } while (newRect !== currentRect)

      while (grid.length <= idx) {
        grid.push([])
      }

      grid[idx].push(l)
    }

    return [topLevel, grid, maxSize]
  }, [layout])

  const visible = useThrottledMemo(
    () => {
      if (layout.length === 0 || viewport.w > topLevel.w / 2 || viewport.h > topLevel.h / 2) {
        return []
      }

      let currentRect = topLevel
      let newRect = currentRect
      let idx = 0
      do {
        currentRect = newRect

        const halfW = currentRect.w / 2
        const halfH = currentRect.h / 2
        const baseX = currentRect.x
        const baseY = currentRect.y

        const quadrants = [
          new Rectangle(baseX, baseY, halfW, halfH),
          new Rectangle(baseX + halfW, baseY, halfW, halfH),
          new Rectangle(baseX, baseY + halfH, halfW, halfH),
          new Rectangle(baseX + halfW, baseY + halfH, halfW, halfH),
        ]
        quadrants.forEach((q, i) => {
          // NOTE: primitive break
          if (newRect !== currentRect) return

          if (q.contains(viewport)) {
            newRect = q
            idx = idx * 4 + i + 1
          }
        })
      } while (newRect !== currentRect)

      function gatherEntries(idx: number): DrawCommand[] {
        if (idx >= layoutGrid.length) {
          return []
        } else {
          return [
            ...layoutGrid[idx],
            ...gatherEntries(idx * 4 + 1),
            ...gatherEntries(idx * 4 + 2),
            ...gatherEntries(idx * 4 + 3),
            ...gatherEntries(idx * 4 + 4),
          ]
        }
      }

      return gatherEntries(idx)
        .filter(dc => dc.dst.intersects(viewport))
        .slice(0, 1000)
    },
    [viewport],
    1000,
  )
  // const visible: DrawCommand[] = useMemo(() => [], [])

  useEffect(() => console.log(visible.length), [visible])

  const metaById = useMemo(() => {
    const byId = new Map<string, ApiImage>()
    for (const meta of metadata) {
      byId.set(meta.id, meta)
    }
    return byId
  }, [metadata])

  const LOAD_THRESHOLD = 2
  useEffect(() => {
    if (!glContext) return

    const toDownload: ApiImageDataRequestV2Entry[] = []
    for (const v of visible) {
      const textureMapping = lookupTexture(v.id)
      if (!textureMapping)
        toDownload.push({
          id: v.id,
          max_width: 100,
          max_height: 100,
        })
      else {
        const meta = metaById.get(v.id)
        if (!meta) throw Error(`Trying to draw unknown id: ${v.id}`)

        const visibleRect = viewportToScreenRect(v.dst)
        const loadedRect = textureMapping.src

        if (
          visibleRect.w / loadedRect.w > LOAD_THRESHOLD &&
          visibleRect.h / loadedRect.h > LOAD_THRESHOLD &&
          loadedRect.w < meta.width &&
          loadedRect.h < meta.height
        ) {
          toDownload.push({
            id: v.id,
            max_width: Math.trunc(visibleRect.w),
            max_height: Math.trunc(visibleRect.h),
          })
        }
      }
    }

    // loadAtlas(toDownload)
  }, [visible])

  return useMemo(() => {
    if (atlases.length === 0) return []

    return layout
      .map(dc => Object.assign(dc, lookupTexture(dc.id)))
      .filter(dc => dc.texture !== undefined)
  }, [atlases, layout])
}
