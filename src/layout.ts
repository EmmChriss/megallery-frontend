import { ApiImage } from './api'
import { DrawCommand } from './store'
import { Rectangle } from './types'

export type Layout<T> = (metadata: T[]) => DrawCommand[]

export interface GridLayoutParams {
  width?: number
  height?: number
  spacing?: number
}

export function createGridLayout(metadata: ApiImage[], params?: GridLayoutParams): DrawCommand[] {
  const width = params?.width || 100
  const height = params?.height || 100
  const spacing = params?.spacing || 10

  const a = Math.trunc(Math.sqrt(metadata.length))
  return metadata.map((_, i) => {
    const _i = i % a
    const _j = Math.trunc(i / a)
    const wh = metadata[i].width / metadata[i].height

    let w = width
    let h = height

    if (wh > 1) {
      h /= wh
    } else {
      w *= wh
    }

    const dst = new Rectangle((width + spacing) * _j, (height + spacing) * _i, w, h)

    return { dst, id: metadata[i].id }
  })
}
