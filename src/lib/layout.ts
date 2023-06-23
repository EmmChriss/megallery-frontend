import { App } from './app'
import { ApiImage, ApiLayoutFilter, ApiLayoutRequest, getLayout, ImageMetadata } from './api'
import { EventHandler } from './eventHandler'
import { DrawCommand } from './store'
import { Point, Rectangle } from './types'

export type ImageWithMetadata = ApiImage & ImageMetadata

export type LayoutGenerator<T> = (metadata: T[]) => DrawCommand[]

export function createTSNELayout(
  metadata: ImageWithMetadata[],
  dist: DistanceFunction,
): DrawCommand[] {
  const m = metadata
  const px = new Float64Array(m.length)
  const py = new Float64Array(m.length)

  // initialize with random values
  for (let i = 0; i < m.length; i++) {
    px[i] = Math.random()
    py[i] = Math.random()
  }

  for (let iter = 0; iter < 20; iter++) {
    for (let i = 0; i < m.length; i++) {
      console.log('hey')
      const mi = m[i]

      for (let idx = 0; idx < Math.sqrt(m.length); idx++) {
        const j = Math.floor(Math.random() * m.length)

        const ac_d = Math.abs(px[i] - px[j]) + Math.abs(py[i] - py[j])
        let th_d = (dist(mi, m[j]) - ac_d) / ac_d / 2

        if (!Number.isFinite(th_d) || Number.isNaN(th_d)) {
          th_d = 0
        }

        const of_x = th_d * (px[j] - px[i])
        if (!Number.isNaN(of_x)) px[i] += of_x

        const of_y = th_d * (py[j] - py[i])
        if (!Number.isNaN(of_y)) py[i] += of_y
      }
    }
  }

  return m.map((m, idx) =>
    Object.assign(m, { dst: new Rectangle(px[idx] * 10000, py[idx] * 10000, 50, 50) }),
  )
}

export interface GridLayoutParams {
  width?: number
  height?: number
  spacing?: number
}

export function createSimpleGridLayout(
  metadata: ImageWithMetadata[],
  params?: GridLayoutParams,
): DrawCommand[] {
  const a = Math.ceil(Math.sqrt(metadata.length))

  let idx = 0
  const m = []
  while (idx < metadata.length) {
    m.push(metadata.slice(idx, idx + a))
    idx += a
  }

  return createGridLayout(m, params)
}

export function createExpansionGridLayout(
  metadata: ImageWithMetadata[],
  compared_to: string,
  dist: DistanceFunction,
  params?: GridLayoutParams,
): DrawCommand[] {
  const m0 = metadata.filter(m => m.id === compared_to)[0]
  const sorted = metadata.sort((m1, m2) => dist(m1, m0) - dist(m2, m0))

  let a = Math.ceil(Math.sqrt(metadata.length))
  a += (a + 1) % 2

  const m: (ApiImage | undefined)[][] = Array.from(new Array(a), a => new Array(a))

  const sorted_positions: [number, number][] = Array.from(new Array(a * a), (_, idx) => {
    const i = idx % a
    const j = Math.trunc(idx / a)

    const min = Math.min(i, j)
    const diff = Math.max(i, j) - min
    const cost = min * 1.4 + diff

    return [i, j, cost]
  })
    .sort(([_ai, _aj, a_cost], [_bi, _bj, b_cost]) => a_cost - b_cost)
    .map(([i, j]) => [i, j])

  const zipped: [ApiImage, [number, number]][] = sorted.map((d, idx) => [d, sorted_positions[idx]])

  for (const [img, [i, j]] of zipped) {
    m[i][j] = img
  }

  return createGridLayout(m, params)
}

export function createGridLayout(
  metadata: (ApiImage | undefined)[][],
  params?: GridLayoutParams,
): DrawCommand[] {
  const width = params?.width || 100
  const height = params?.height || 100
  const spacing = params?.spacing || 10

  return metadata
    .map((row, i) =>
      row.map((e, j) => {
        if (e === undefined) return

        const wh = e.width / e.height

        let w = width
        let h = height

        if (wh > 1) {
          h /= wh
        } else {
          w *= wh
        }

        const dst = new Rectangle((width + spacing) * j, (height + spacing) * i, w, h)

        return { dst, id: e.id }
      }),
    )
    .flat()
    .filter(e => e) as DrawCommand[]
}

export interface LineLayoutParams {
  direction?: 'vertical' | 'horizontal'
  width?: number
  height?: number
  spacing?: number
}

export function createLineLayout(metadata: ApiImage[], params?: LineLayoutParams): DrawCommand[] {
  const direction = params?.direction || 'horizontal'
  const width = params?.width || 100
  const height = params?.height || 100
  const spacing = params?.spacing || 10

  return metadata.map((_, i) => {
    const wh = metadata[i].width / metadata[i].height

    let w = width
    let h = height

    if (wh > 1) {
      h /= wh
    } else {
      w *= wh
    }

    const x = (direction == 'horizontal' && i * (width + spacing)) || 0
    const y = (direction == 'vertical' && i * (height + spacing)) || 0

    const dst = new Rectangle(x, y, w, h)

    return { dst, id: metadata[i].id }
  })
}

export type DistanceFunction = (m1: ImageMetadata, m2: ImageMetadata) => number

export type FilterFunction = <T extends ImageMetadata>(img: T) => boolean

export interface OrganizerEventMap {
  'changed-layout': (layout: DrawCommand[]) => void
}

export type LayoutDescriptor = ApiLayoutRequest | FrontendLayout

const FRONTEND_LAYOUTS = ['grid']
type FrontendLayout = { type: 'grid' }

export class Organizer extends EventHandler<OrganizerEventMap> {
  app: App

  metadata: Map<string, ImageMetadata> = new Map()
  images: Map<string, ApiImage> = new Map()

  layout: DrawCommand[] = []
  layoutDescriptor: LayoutDescriptor = { type: 'grid' }
  filter: ApiLayoutFilter = {}

  constructor(app: App) {
    super()

    this.app = app

    app.addEventListener('changed-images', async (imgs, metadata) => {
      this.metadata = metadata
      this.images = imgs

      this.regenerateLayout()
    })
  }

  public setFilter(filter: ApiLayoutFilter) {
    this.filter = filter
    this.regenerateLayout()
  }

  public setLayout(layout: LayoutDescriptor) {
    this.layoutDescriptor = layout
    this.regenerateLayout()
  }

  async regenerateLayout() {
    console.log(this.layoutDescriptor)

    if (FRONTEND_LAYOUTS.includes(this.layoutDescriptor.type)) {
      if (this.layoutDescriptor.type === 'grid') {
        this.layout = createSimpleGridLayout([...this.images.values()])
      }
    } else {
      const req = Object.assign({}, this.layoutDescriptor as ApiLayoutRequest, {
        filter: this.filter,
      })
      console.log(req)

      const resp = await getLayout(this.app.collection!.id, req)

      if (resp.type === 'sort') {
        this.layout = createLineLayout(resp.data.map(id => this.images.get(id)!))
      } else if (resp.type === 'grid') {
        this.layout = createGridLayout(
          resp.data.map(row =>
            row.map(id =>
              id === null
                ? undefined
                : Object.assign({}, this.images.get(id), this.metadata.get(id)),
            ),
          ),
        )
      } else if (resp.type === 'pos') {
        const scaled = resp.data.map(
          ([id, x, y]) => [id, x * 100_000, y * 100_000] as [string, number, number],
        )

        const data = scaled.map(([id, xi, yi], i) => {
          let s = Infinity

          for (let j = 0; j < scaled.length; j++) {
            if (i === j) continue

            const [_, xj, yj] = scaled[j]

            s = Math.max(10, Math.min(s, Math.abs(xi - xj)))
            s = Math.max(10, Math.min(s, Math.abs(yi - yj)))
          }

          s = Math.max(s, 10) * 4
          s = Math.max(s, 10) * 4

          return [id, xi, yi, s] as [string, number, number, number]
        })

        this.layout = data.map(([id, x, y, s]) =>
          Object.assign({ id, dst: Rectangle.fromCenter(new Point(x, y), s, s) }),
        )
      }
    }

    this.emitEvent('changed-layout', this.layout)
  }
}

const palette_dist = (a: ImageMetadata, b: ImageMetadata) => {
  if (!a.palette || !b.palette) {
    return Infinity
  } else {
    const a_average = [0, 0, 0]
    for (const pa of a.palette) {
      a_average[0] += pa[0]
      a_average[1] += pa[1]
      a_average[2] += pa[2]
    }
    a_average[0] /= a.palette.length
    a_average[1] /= a.palette.length
    a_average[2] /= a.palette.length

    const b_average = [0, 0, 0]
    for (const pb of b.palette) {
      b_average[0] += pb[0]
      b_average[1] += pb[1]
      b_average[2] += pb[2]
    }
    b_average[0] /= b.palette.length
    b_average[1] /= b.palette.length
    b_average[2] /= b.palette.length

    return (
      a_average[0] - b_average[0] + (a_average[1] - b_average[1]) + (a_average[2] - b_average[2])
    )
  }
}

const identity_dist = (_a: ImageMetadata, _b: ImageMetadata) => 0
