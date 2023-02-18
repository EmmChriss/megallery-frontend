import { ApiImage } from './api'
import { DrawCommand } from './store'

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

    return {
      id: metadata[i].id,
      w: w,
      h: h,
      x: (width + spacing) * _j,
      y: (height + spacing) * _i,
    }
  })
}
