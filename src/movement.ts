import { useEffect } from 'react'
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
        const center = viewport.getCenter().translate(-m.x * MOVE_STEP * viewport.w, -m.y * MOVE_STEP * viewport.h)
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
