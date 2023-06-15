import { App } from './app'
import { ApiImage, getLayout, ImageMetadata } from './api'
import { EventHandler } from './eventHandler'
import { DrawCommand } from './store'
import { Rectangle } from './types'
import { measureTime, measureTimeCallback } from './util'

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

export class Organizer extends EventHandler<OrganizerEventMap> {
  app: App

  metadata: Map<string, ImageMetadata> = new Map()
  layout: DrawCommand[] = []

  distanceFunction: DistanceFunction = palette_dist
  filter: FilterFunction = () => true
  layoutGenerator: LayoutGenerator<ImageWithMetadata> = m => createSimpleGridLayout(m)

  constructor(app: App) {
    super()

    this.app = app

    app.addEventListener('changed-images', async (imgs, metadata) => {
      this.metadata = metadata

      const array = [...metadata.values()]
      const filtered = array.filter(this.filter)
      const filteredIds = new Set(filtered.map(m => m.id))
      const composite = filtered.map(m => Object.assign(m, imgs.get(m.id)))

      if (array.length === 0) return

      const compared_to = array.filter(m => m.palette)[0].id
      getLayout(app.collection!.id, { type: 'grid_expansion', compared_to, dist: 'palette' })
      this.layoutGenerator = m => createExpansionGridLayout(m, compared_to, this.distanceFunction)
      // this.layoutGenerator = m => createTSNELayout(m, this.distanceFunction)

      const clock = measureTimeCallback('fetching layout from backend', 1)
      const layout = await getLayout(app.collection!.id, {
        type: 'grid_expansion',
        compared_to,
        dist: 'palette',
      }).then(resp => {
        // construct extended grid that we can use
        const grid = resp.data.map(row =>
          row.map(id =>
            id === null ? undefined : Object.assign({}, imgs.get(id), metadata.get(id)),
          ),
        )

        // construct layout from grid
        return createGridLayout(grid)
      })
      clock()

      measureTime('calculating layout', 1, () => (this.layout = this.layoutGenerator(composite)))
      this.layout = layout

      this.emitEvent('changed-layout', this.layout)
    })
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
