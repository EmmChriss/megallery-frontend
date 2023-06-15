import { useMemo, useState } from 'react'
import { ApiImage } from './api'
import { DrawCommand } from './store'
import { Rectangle } from './types'

export type Layout<T> = (metadata: T[]) => DrawCommand[]

export const withParams = <T, P1, P2 extends Array<unknown>>(
  func: (arg1: P1, ...args2: P2) => T,
  ...params: P2
) => {
  return (arg1: P1) => func(arg1, ...params)
}

export function useLayout<T>(
  metadata: T[],
): [DrawCommand[], React.Dispatch<React.SetStateAction<Layout<T> | undefined>>] {
  const [layout, setLayout] = useState<Layout<T>>()
  const drawCommands = useMemo(() => {
    if (layout === undefined) return []

    return layout(metadata)
  }, [layout, metadata])

  return [drawCommands, setLayout]
}

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
