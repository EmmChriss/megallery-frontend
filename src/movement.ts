import { useEffect } from "react"
import { Viewport } from "./graphics"

const MOVE_INTERVAL_MS = 5
const MOVE_STEP = 0.005
const ZOOM_BASE = 1.01

export function useKeyboardMovement(
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>
) {
  useEffect(() => {
    const keysHeld = new Set<string>()

    const move = () => {
      const m = {
        x: (keysHeld.has("a") ? 1 : 0) - (keysHeld.has("d") ? 1 : 0),
        y: (keysHeld.has("s") ? 1 : 0) - (keysHeld.has("w") ? 1 : 0),
        zoom: (keysHeld.has("e") ? 1 : 0) - (keysHeld.has("q") ? 1 : 0)
      }

      // no movement
      if (m.x == 0 && m.y == 0 && m.zoom == 0)
        return
      
      setViewport(viewport => {
        const vp = Object.assign({}, viewport)
        
        vp.centerX += m.x * MOVE_STEP * vp.width
        vp.centerY += m.y * MOVE_STEP * vp.height
 
        if (m.zoom > 0) {
          vp.width /= ZOOM_BASE
          vp.height /= ZOOM_BASE
        } else if (m.zoom < 0) {
          vp.width *= ZOOM_BASE
          vp.height *= ZOOM_BASE
        }

        return vp
      })
    }
    const moveTimer = setInterval(move, MOVE_INTERVAL_MS)

    const onKeyDown = (ev: KeyboardEvent) => {
      keysHeld.add(ev.key)
    }

    const onKeyUp = (ev: KeyboardEvent) => {
      keysHeld.delete(ev.key)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      clearInterval(moveTimer)
    }
  }, [])
}
