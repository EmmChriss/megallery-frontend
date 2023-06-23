import { App } from './app'
import { ApiBulkImageRequestEntry, getStaticAtlas } from './api'
import { EventHandler } from './eventHandler'
import {
  Texture,
  uploadSubTexture,
  createTexture,
  clearTexture,
  uploadTexture,
  initEmptyTexture,
  getWebGLTexture,
} from './gl'
import { GLContext, GraphicsDrawCommand } from './graphics'
import { Point, Rectangle } from './types'
import { measureTime, measureTimeAsync, measureTimeCallback } from './util'
import { Viewport } from './viewport'

export interface DrawCommand {
  id: string
  dst: Rectangle
}

export interface TextureAtlas {
  texture: Texture
  mapping: Map<string, Rectangle>
}

const UPLOAD_CANVAS = document.createElement('canvas')
UPLOAD_CANVAS.style.display = 'none'
document.getElementById('main')?.appendChild(UPLOAD_CANVAS)

export class CollisionGrid {
  constructor(
    public root: Rectangle,
    public cellW: number,
    public cellH: number,
    public cells: CollisionGridCell[][],
  ) {}

  getGridCellCoords(p: Point, round: 'up' | 'down'): [number, number] {
    const x = (p.x - this.root.x) / this.cellW
    const y = (p.y - this.root.y) / this.cellH

    if (round === 'up') {
      return [Math.ceil(x), Math.ceil(y)]
    } else if (round === 'down') {
      return [Math.floor(x), Math.floor(y)]
    } else throw Error('')
  }

  collisionsRect(r: Rectangle): GraphicsDrawCommand[] {
    let [baseX, baseY] = this.getGridCellCoords(r.getBasePoint(), 'down')!
    let [offsetX, offsetY] = this.getGridCellCoords(r.getOffsetPoint(), 'up')!

    baseX = Math.max(baseX, 0)
    baseY = Math.max(baseY, 0)

    offsetX = Math.min(offsetX, this.cells.length - 1)
    offsetY = Math.min(offsetY, this.cells[0].length - 1)

    const numOfCells = this.cells.length * this.cells[0].length
    if ((baseX - offsetX + 1) * (baseY - offsetY + 1) > Math.sqrt(numOfCells)) {
      return []
    }

    const drawCommands = []
    for (let i = baseX; i <= offsetX; i++) {
      for (let j = baseY; j <= offsetY; j++) {
        drawCommands.push(...this.cells[i][j].intersects)
      }
    }

    return drawCommands
  }

  collisionsCoord(p: Point): GraphicsDrawCommand[] {
    const [x, y] = this.getGridCellCoords(p, 'down')

    if (x < 0 || y < 0 || x > this.cells.length - 1 || y > this.cells[0].length - 1) return []

    return this.cells[x][y].intersects.filter(gdc => gdc.dst.containsCoord(p))
  }
}

interface CollisionGridCell {
  rect: Rectangle
  intersects: GraphicsDrawCommand[]
}

interface TextureStoreEventMap {
  'changed-atlases': () => void
  'changed-graphics-draw-commands': (drawCommands: GraphicsDrawCommand[]) => void
  'changed-visible': (visible: DrawCommand[]) => void
  'changed-collision-grid': (collisionGrid: CollisionGrid) => void
}

export class TextureStore extends EventHandler<TextureStoreEventMap> {
  app: App
  viewport: Viewport
  glContext: GLContext

  isDownloading: boolean = false
  atlases: TextureAtlas[] = []
  atlasCache = new Map<string, number>()

  graphicsDrawCommands: GraphicsDrawCommand[] = []

  prevIds = new Set<string>()
  layout: DrawCommand[] = []

  collisionGrid?: CollisionGrid
  visible: GraphicsDrawCommand[] = []
  updateVisibleThrottle?: number
  loadVisibleThrottle?: number

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

        // initialize atlas cache
        for (let i = 0; i < this.atlases.length; i++) {
          const atlas = this.atlases[i]
          for (const id of atlas.mapping.keys()) {
            this.atlasCache.set(id, i)
          }
        }

        staticAtlasClock()
      }

      measureTimeAsync(
        'updating draw commands',
        1,
        async () => await this.updateGraphicsDrawCommands(),
      )
    })
    app.viewport.addEventListener('move', viewport => {
      const now = performance.now()
      if (now - (this.updateVisibleThrottle ?? 0) > 5) {
        this.updateVisibleThrottle = now
        this.updateVisible(viewport)
      }
    })
    this.addEventListener('changed-atlases', () => {
      this.updateGraphicsDrawCommands()
      this.updateVisible(this.viewport)
    })
    this.addEventListener('changed-visible', () => {
      const now = performance.now()
      if (now - (this.loadVisibleThrottle ?? 0) > 10) {
        this.loadVisibleThrottle = now
        this.loadVisible()
      }
    })
    this.addEventListener('changed-graphics-draw-commands', () => {
      measureTime('updating collision grid', 1, () => this.updateCollisionGrid())
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
        async () => await this.queryBulkImagesIntoAtlas(this.glContext, req),
      )

      if (!newAtlas) continue

      for (const id of newAtlas.mapping.keys()) {
        this.atlasCache.set(id, this.atlases.length)
      }

      this.atlases.push(newAtlas)
    }

    this.emitEvent('changed-atlases')
    this.isDownloading = false
  }

  protected async updateGraphicsDrawCommands() {
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

    const lookupTexture = (id: string) => {
      const atlasIdx = this.atlasCache.get(id)
      if (atlasIdx === undefined) return

      const atlas = this.atlases[atlasIdx]
      if (!atlas) return

      const mapping = atlas.mapping.get(id)
      if (!mapping) return

      return {
        texture: atlas.texture,
        src: mapping,
      }
    }

    this.graphicsDrawCommands = this.layout
      .map(dc => Object.assign(dc, lookupTexture(dc.id)))
      .filter(dc => dc.texture !== undefined)

    setTimeout(
      () => this.emitEvent('changed-graphics-draw-commands', this.graphicsDrawCommands),
      10,
    )
  }

  protected updateCollisionGrid() {
    const [minX, minY, maxX, maxY] = this.graphicsDrawCommands.reduce(
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

    for (const gdc of this.graphicsDrawCommands) {
      const baseX = gdc.dst.x - minX
      const baseY = gdc.dst.y - minY

      const offsetX = gdc.dst.x + gdc.dst.w - minX
      const offsetY = gdc.dst.y + gdc.dst.h - minY

      const idxBX = Math.floor(baseX / cellW)
      const idxBY = Math.floor(baseY / cellH)

      const idxOX = Math.ceil(offsetX / cellW)
      const idxOY = Math.ceil(offsetY / cellH)

      for (let x = idxBX; x < idxOX; x++) {
        for (let y = idxBY; y < idxOY; y++) {
          cells[x][y].intersects.push(gdc)
        }
      }
    }

    this.collisionGrid = new CollisionGrid(root, cellW, cellH, cells)
    this.emitEvent('changed-collision-grid', this.collisionGrid)
  }

  protected updateVisible(viewport: Viewport) {
    this.visibleTextures.clear()

    if (!this.collisionGrid) {
      return
    }

    const drawCommands = this.collisionGrid.collisionsRect(viewport.rect)

    this.visible = drawCommands

    for (const gdc of drawCommands) {
      this.visibleTextures.add(gdc.texture)
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

    if (toLoad.length > 0) this.loadAtlas(toLoad)
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
      uploadTexture(glContext.gl, atlas, getWebGLTexture(texture))

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

    const { atlas_mapping, texture_mapping, buf_width, buf_height } =
      await this.app.worker.getBulkImagesAndConstructAtlas(this.app.collection.id, req)

    if (buf_width === 0 || buf_height === 0) return

    const texture = createTexture(glContext.gl)
    if (!texture) throw new Error('could not initialize texture')

    measureTime('clearing texture', 0, () => {
      initEmptyTexture(glContext.gl, texture, buf_width, buf_height)
      clearTexture(glContext.gl, texture)
    })

    await measureTimeAsync(
      'uploading textures',
      0,
      async () =>
        await new Promise(resolve => {
          const keys = [...atlas_mapping.keys()]

          const onAfterRender = () => {
            const key = keys.pop()
            if (key === undefined) {
              this.app.removeEventListener('on-after-render', onAfterRender)
              resolve(undefined)
              return
            }

            const mapping = atlas_mapping.get(key)!
            const image = texture_mapping.get(key)!

            uploadSubTexture(
              glContext.gl,
              image,
              getWebGLTexture(texture),
              new Point(mapping.x, mapping.y),
            )
          }

          this.app.addEventListener('on-after-render', onAfterRender)
        }),
    )

    return {
      texture,
      mapping: atlas_mapping,
    }
  }
}
