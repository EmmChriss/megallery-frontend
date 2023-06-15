import { App } from './app'
import { ApiBulkImageRequestEntry, getStaticAtlas } from './api'
import { EventHandler } from './eventHandler'
import { executeJob } from './fetch.types'
import Worker from './fetch.worker'
import {
  Texture,
  uploadSubTexture,
  createTexture,
  clearTexture,
  uploadTexture,
  initEmptyTexture,
} from './gl'
import { GLContext, GraphicsDrawCommand } from './graphics'
import { Point, Rectangle } from './types'
import { measureTime, measureTimeAsync, measureTimeCallback } from './util'
import { Viewport } from './viewport'

export interface DrawCommand {
  id: string
  dst: Rectangle
}

interface TextureAtlas {
  texture: Texture
  mapping: Map<string, Rectangle>
}

const UPLOAD_CANVAS = document.createElement('canvas')
UPLOAD_CANVAS.style.display = 'none'
document.getElementById('main')?.appendChild(UPLOAD_CANVAS)

interface CollisionGrid {
  root: Rectangle
  cellW: number
  cellH: number
  cells: CollisionGridCell[][]
}

interface CollisionGridCell {
  rect: Rectangle
  intersects: DrawCommand[]
}

interface TextureStoreEventMap {
  'changed-atlases': () => void
  'changed-graphics-draw-commands': (drawCommands: GraphicsDrawCommand[]) => void
  'changed-visible': (visible: DrawCommand[]) => void
}

export class TextureStore extends EventHandler<TextureStoreEventMap> {
  app: App
  viewport: Viewport
  glContext: GLContext

  isDownloading: boolean = false
  atlases: TextureAtlas[] = []

  graphicsDrawCommands: GraphicsDrawCommand[] = []
  dstToGDC: Map<Rectangle, GraphicsDrawCommand> = new Map()

  prevIds = new Set<string>()
  layout: DrawCommand[] = []

  collisionGrid?: CollisionGrid
  visible: DrawCommand[] = []
  updateVisibleThrottle?: number
  loadVisibleTimer?: number

  visibleTextures: Set<Texture> = new Set()

  constructor(app: App, glContext: GLContext) {
    super()

    this.app = app
    this.viewport = app.viewport
    this.glContext = glContext

    app.organizer.addEventListener('changed-layout', async layout => {
      this.layout = layout

      if (layout.length === 0) return

      if (this.atlases.length === 0) {
        const staticAtlasClock = measureTimeCallback('static atlas', 1)
        const atlases = await this.queryStaticAtlas(glContext)
        this.atlases.push(...atlases)
        staticAtlasClock()
      }

      measureTime('updating collision grid', 1, () => this.updateCollisionGrid())
      measureTime('updating draw commands', 1, () => this.updateGraphicsDrawCommands())
    })
    app.viewport.addEventListener('move', viewport => {
      const now = performance.now()
      if (now - (this.updateVisibleThrottle ?? 0) > 50) {
        this.updateVisibleThrottle = now
        measureTime('updating visible', 1, () => this.updateVisible(viewport))
      }
    })
    this.addEventListener('changed-atlases', () => {
      this.updateGraphicsDrawCommands()
      this.updateVisible(this.viewport)
    })
    this.addEventListener('changed-visible', () => {
      clearTimeout(this.loadVisibleTimer)
      this.loadVisibleTimer = setTimeout(() => this.loadVisible(), 200) as unknown as number
    })
  }

  protected async loadAtlas(req: ApiBulkImageRequestEntry[]) {
    if (this.isDownloading) return
    this.isDownloading = true

    const CUTOFF = 500
    let remaining = [...req]

    while (remaining.length > 0) {
      const req = remaining.slice(0, CUTOFF)
      remaining = remaining.slice(CUTOFF)

      const newAtlas = await measureTimeAsync(
        'building atlas',
        1,
        this.queryBulkImagesIntoAtlas(this.glContext, req),
      )

      if (!newAtlas) continue

      this.atlases.push(newAtlas)
      this.emitEvent('changed-atlases')
    }

    this.isDownloading = false
  }

  protected lookupTexture(id: string) {
    for (let i = this.atlases.length - 1; i >= 0; i--) {
      const atlas = this.atlases[i]
      if (!atlas) continue

      const mapping = atlas.mapping.get(id)
      if (!mapping) continue

      return {
        texture: atlas.texture,
        src: mapping,
      }
    }
  }

  protected updateGraphicsDrawCommands() {
    // const ids = new Set([...this.layout.map(dc => dc.id)])
    // const newIds = [...ids.keys()].filter(k => !this.prevIds.has(k))

    // if (newIds.length > 0) {
    //   newIds.forEach(id => this.prevIds.add(id))

    //   const req = this.layout.map(dc =>
    //     Object.assign({
    //       id: dc.id,
    //       max_width: 20,
    //       max_height: 20,
    //     }),
    //   )
    //   this.loadAtlas(req)
    // }

    this.graphicsDrawCommands = this.layout
      .map(dc => Object.assign(dc, this.lookupTexture(dc.id)))
      .filter(dc => dc.texture !== undefined)

    this.dstToGDC.clear()
    for (const gdc of this.graphicsDrawCommands) {
      this.dstToGDC.set(gdc.dst, gdc)
    }

    this.emitEvent('changed-graphics-draw-commands', this.graphicsDrawCommands)
  }

  protected updateCollisionGrid() {
    const [minX, minY, maxX, maxY] = this.layout.reduce(
      ([minX, minY, maxX, maxY], c) => [
        Math.min(minX, c.dst.x),
        Math.min(minY, c.dst.y),
        Math.max(maxX, c.dst.x + c.dst.w),
        Math.max(maxY, c.dst.y + c.dst.h),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    )

    const root = new Rectangle(minX, minY, maxX - minX, maxY - minY)
    const [cellW, cellH] = [Math.sqrt(root.w), Math.sqrt(root.h)]
    const [cellX, cellY] = [Math.ceil(root.w / cellW), Math.ceil(root.h / cellH)]

    const cells: CollisionGridCell[][] = []
    for (let i = 0; i < cellX; i++) {
      const cellsY: CollisionGridCell[] = []
      for (let j = 0; j < cellY; j++) {
        const cell = {
          rect: new Rectangle(minX + i * cellW, minY + j * cellH, cellW, cellH),
          intersects: [],
        }
        cellsY.push(cell)
      }
      cells.push(cellsY)
    }

    for (const dc of this.layout) {
      const baseX = dc.dst.x - minX
      const baseY = dc.dst.y - minY

      const offsetX = dc.dst.x + dc.dst.w - minX
      const offsetY = dc.dst.y + dc.dst.h - minY

      const idxBX = Math.floor(baseX / cellW)
      const idxBY = Math.floor(baseY / cellH)

      const idxOX = Math.ceil(offsetX / cellW)
      const idxOY = Math.ceil(offsetY / cellH)

      for (let x = idxBX; x < idxOX; x++) {
        for (let y = idxBY; y < idxOY; y++) {
          cells[x][y].intersects.push(dc)
        }
      }
    }

    this.collisionGrid = { root, cellW, cellH, cells }
  }

  protected updateVisible(viewport: Viewport) {
    this.visibleTextures.clear()

    if (!this.collisionGrid) {
      return
    }

    // intersect with collisionGrid
    const getGridCellCoords = (p: Point, round: 'up' | 'down') => {
      const x = (p.x - this.collisionGrid!.root.x) / this.collisionGrid!.cellW
      const y = (p.y - this.collisionGrid!.root.y) / this.collisionGrid!.cellH

      if (round === 'up') {
        return [Math.ceil(x), Math.ceil(y)]
      } else if (round === 'down') {
        return [Math.floor(x), Math.floor(y)]
      }
    }

    let [baseX, baseY] = getGridCellCoords(viewport.rect.getBasePoint(), 'down')!
    let [offsetX, offsetY] = getGridCellCoords(viewport.rect.getOffsetPoint(), 'up')!

    baseX = Math.max(baseX, 0)
    baseY = Math.max(baseY, 0)

    offsetX = Math.min(offsetX, this.collisionGrid.cells.length - 1)
    offsetY = Math.min(offsetY, this.collisionGrid.cells[0].length - 1)

    const numOfCells = this.collisionGrid.cells.length * this.collisionGrid.cells[0].length
    if ((baseX - offsetX + 1) * (baseY - offsetY + 1) > Math.sqrt(numOfCells)) {
      this.visible = []
      return
    }

    const drawCommands = []
    for (let i = baseX; i <= offsetX; i++) {
      for (let j = baseY; j <= offsetY; j++) {
        drawCommands.push(...this.collisionGrid.cells[i][j].intersects)
      }
    }

    this.visible = drawCommands

    for (const dc of drawCommands) {
      const gdc = this.dstToGDC.get(dc.dst)
      if (gdc) {
        this.visibleTextures.add(gdc.texture)
      }
    }

    this.emitEvent('changed-visible', this.visible)
  }

  protected loadVisible() {
    if (this.visible.length === 0) {
      return
    }

    const visibleIds = new Set(this.visible.map(dc => dc.dst))

    const LOAD_SIZE_THRESHOLD = 2
    const LOAD_SIZE_FACTOR = 8
    let toLoad: ApiBulkImageRequestEntry[] = []
    this.graphicsDrawCommands.forEach(gdc => {
      if (!visibleIds.has(gdc.dst)) {
        return
      }

      const visibleRect = this.viewport.viewportToScreenRect(gdc.dst)
      if (
        visibleRect.w / gdc.src.w < LOAD_SIZE_THRESHOLD ||
        visibleRect.h / gdc.src.h < LOAD_SIZE_THRESHOLD
      ) {
        return
      }

      const meta = this.app.images.get(gdc.id)
      if (!meta || (gdc.src.w >= meta.width && gdc.src.h >= meta.height)) {
        return
      }

      toLoad.push({
        id: gdc.id,
        width: Math.ceil(visibleRect.w * LOAD_SIZE_FACTOR),
        height: Math.ceil(visibleRect.h * LOAD_SIZE_FACTOR),
      })
    })

    this.loadAtlas(toLoad)
  }

  async queryStaticAtlas(glContext: GLContext): Promise<TextureAtlas[]> {
    if (!this.app.collection) throw new Error('no collection open')

    const atlases = await getStaticAtlas(this.app.collection.id)
    const result: TextureAtlas[] = []
    for (const { atlas, mapping } of atlases) {
      const texture = createTexture(glContext.gl)
      if (!texture) throw new Error('could not create texture')

      texture.width = atlas.width
      texture.height = atlas.height
      uploadTexture(glContext.gl, atlas, texture.texture)

      const atlas_mapping = new Map<string, Rectangle>()
      for (const m of mapping) {
        const rect = new Rectangle(m.x, m.y, m.width, m.height)
        atlas_mapping.set(m.id, rect)
      }

      result.push({
        mapping: atlas_mapping,
        texture,
      })
    }

    return result
  }

  async queryBulkImagesIntoAtlas(
    glContext: GLContext,
    req: ApiBulkImageRequestEntry[],
  ): Promise<TextureAtlas | undefined> {
    if (req.length === 0 || !this.app.collection) {
      return
    }

    const { atlas_mapping, texture_mapping, buf_width, buf_height } = await executeJob(
      'apiBulkImageRequest',
      Worker,
      [],
      this.app.collection.id,
      req,
    )

    if (buf_width === 0 || buf_height === 0) return

    const texture = createTexture(glContext.gl)
    if (!texture) throw new Error('could not initialize texture')

    measureTime('clearing texture', 0, () => {
      initEmptyTexture(glContext.gl, texture, buf_width, buf_height)
      clearTexture(glContext.gl, texture)
    })

    measureTime('uploading textures', 0, () => {
      for (const id of atlas_mapping.keys()) {
        const mapping = atlas_mapping.get(id)!
        const image = texture_mapping.get(id)!

        uploadSubTexture(glContext.gl, image, texture.texture, new Point(mapping.x, mapping.y))
      }
    })

    // const canvas = UPLOAD_CANVAS
    // canvas.width = buf_width
    // canvas.height = buf_height

    // const ctx = canvas.getContext('2d')
    // if (!ctx)
    //   throw new Error("Could not create canvas context")

    // for (const id of atlas_mapping.keys()) {
    //   const mapping = atlas_mapping.get(id)!
    //   const image = texture_mapping.get(id)!

    //   ctx.drawImage(image, mapping.x, mapping.y, mapping.w, mapping.h)
    // }

    // const blob = await new Promise<Blob | null>((resolve, reject) => {
    //   canvas.toBlob(resolve, 'image/png')
    // })

    // if (!blob)
    //   throw new Error()

    // console.log(URL.createObjectURL(blob))
    // console.log(atlas_mapping)

    // const bitmap = await createImageBitmap(blob)
    // uploadTexture(glContext.gl, bitmap, texture.texture)

    return {
      texture,
      mapping: atlas_mapping,
    }
  }
}
