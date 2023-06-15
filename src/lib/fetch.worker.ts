import { getBulkImages } from './api'
import { Rectangle } from './types'
import { measureTimeAsync, measureTimeCallback } from './util'
import { Job, JobTypeMap } from './fetch.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default null as any

// eslint-disable-next-line no-restricted-globals,@typescript-eslint/no-explicit-any
const ctx: Worker = self as any
ctx.addEventListener('message', async <K extends keyof JobTypeMap>(msg: MessageEvent<Job<K>>) => {
  const job = msg.data
  if (job.type == 'apiBulkImageRequest') {
    const [collection_id, req] = job.args

    const resp = await measureTimeAsync('awaiting response', 0, getBulkImages(collection_id, req))

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

    ctx.postMessage(
      {
        atlas_mapping,
        texture_mapping,
        buf_width,
        buf_height,
      },
      resp.filter(r => r !== null) as ImageBitmap[],
    )
  }
})
