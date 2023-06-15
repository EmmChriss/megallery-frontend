import { useEffect, useState } from 'react'
import { ApiImage } from './api'
import { Layout } from './layout'
import { Rectangle } from './types'

const MOVE_INTERVAL_MS = 5
const MOVE_STEP = 0.005
const ZOOM_BASE = 1.01

export function useKeyboardMovement(setViewport: React.Dispatch<React.SetStateAction<Rectangle>>) {
  useEffect(() => {
    const keysHeld = new Set<string>()

    const move = () => {
      const m = {
        x: (keysHeld.has('a') ? 1 : 0) - (keysHeld.has('d') ? 1 : 0),
        y: (keysHeld.has('s') ? 1 : 0) - (keysHeld.has('w') ? 1 : 0),
        zoom: (keysHeld.has('e') ? 1 : 0) - (keysHeld.has('q') ? 1 : 0),
      }

      // no movement
      if (m.x === 0 && m.y === 0 && m.zoom === 0) return

      setViewport(viewport => {
        const center = viewport
          .getCenter()
          .translate(-m.x * MOVE_STEP * viewport.w, -m.y * MOVE_STEP * viewport.h)
        let width = viewport.w
        let height = viewport.h

        if (m.zoom > 0) {
          width /= ZOOM_BASE
          height /= ZOOM_BASE
        } else if (m.zoom < 0) {
          width *= ZOOM_BASE
          height *= ZOOM_BASE
        }

        return Rectangle.fromCenter(center, width, height)
      })
    }
    const moveTimer = setInterval(move, MOVE_INTERVAL_MS)

    const onKeyDown = (ev: KeyboardEvent) => {
      keysHeld.add(ev.key)
    }

    const onKeyUp = (ev: KeyboardEvent) => {
      keysHeld.delete(ev.key)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      clearInterval(moveTimer)
    }
  }, [])
}

export function useKeyboardLayoutSwitcher(
  setLayout: React.Dispatch<React.SetStateAction<Layout<ApiImage> | undefined>>,
  layouts: Layout<ApiImage>[],
) {
  const [idx, setIdx] = useState(0)

  useEffect(() => setIdx(0), [layouts])
  useEffect(() => setLayout(() => layouts[idx]), [idx])

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key == 'f') {
        const newIdx = (idx - 1 + layouts.length) % layouts.length
        setIdx(newIdx)
      }
      if (ev.key == 'g') {
        setIdx((idx + 1) % layouts.length)
      }

      const num = Number.parseInt(ev.key)
      if (!Number.isNaN(num) && num >= 0 && num < layouts.length) {
        setIdx(num)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
