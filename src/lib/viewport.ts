import { Z_VERSION_ERROR } from 'zlib'
import { App } from './app'
import { EventHandler } from './eventHandler'
import { Point, Rectangle } from './types'

const MOVE_STEP = 1
const ZOOM_BASE = 2

interface ViewportEventMap {
  resize: () => void
  move: (viewport: Viewport) => void
  click: (p: Point) => void
}

export class Viewport extends EventHandler<ViewportEventMap> {
  app: App
  canvas: HTMLCanvasElement
  rect: Rectangle

  timer: { now: number }
  keysHeld: Set<string>

  dragging = false

  constructor(app: App) {
    super()

    this.app = app

    this.canvas = app.canvas
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
    this.rect = new Rectangle(0, 0, app.canvas.width, app.canvas.height)

    this.timer = { now: performance.now() }

    // keyboard movement
    this.keysHeld = new Set<string>()

    this.initMovement()
    this.initRescaleOnResize()

    this.app.organizer.addEventListener('changed-layout', async layout => {
      if (layout.length === 0) return

      const [minX, minY, maxX, maxY] = layout.reduce(
        ([minX, minY, maxX, maxY], dc) => [
          Math.min(minX, dc.dst.x),
          Math.min(minY, dc.dst.y),
          Math.max(maxX, dc.dst.x + dc.dst.w),
          Math.max(maxY, dc.dst.y + dc.dst.h),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
      )

      // calculate smallest rectangle that fits images
      // also, don't override wh ratio
      const contain = new Rectangle(minX, minY, maxX - minX, maxY - minY)

      let w
      let h
      if (this.rect.w > this.rect.h) {
        w = contain.w
        h = (this.rect.h / this.rect.w) * w
      } else {
        h = contain.h
        w = (this.rect.w / this.rect.h) * h
      }

      const rect = Rectangle.fromCenter(contain.getCenter(), w, h)

      // crude compare-and-swap algorithm to make sure we aren't caught up in the move-loop
      while (this.rect !== rect) {
        this.rect = rect
        await new Promise(resolve => setTimeout(resolve, 2))
      }
    })
  }

  protected initMovement() {
    const onKeyDown = (ev: KeyboardEvent) => {
      this.keysHeld.add(ev.key)
    }

    const onKeyUp = (ev: KeyboardEvent) => {
      this.keysHeld.delete(ev.key)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const onClick = (evt: MouseEvent) => {
      // remember to translate from topleft to bottomleft coordinate system
      const screenPoint = new Point(evt.clientX, this.canvas.height - evt.clientY)
      const viewportPoint = this.screenToViewportCoord(screenPoint)
      this.emitEvent('click', viewportPoint)
    }

    this.canvas.addEventListener('click', onClick)
  }

  public move() {
    const now = performance.now()
    const delta = (now - this.timer.now) / 1000
    this.timer.now = now

    const m = {
      x: (this.keysHeld.has('a') ? 1 : 0) - (this.keysHeld.has('d') ? 1 : 0),
      y: (this.keysHeld.has('s') ? 1 : 0) - (this.keysHeld.has('w') ? 1 : 0),
      zoom: (this.keysHeld.has('e') ? 1 : 0) - (this.keysHeld.has('q') ? 1 : 0),
    }

    // no movement
    if (m.x === 0 && m.y === 0 && m.zoom === 0) {
      return
    }

    const center = this.rect
      .getCenter()
      .translate(-m.x * MOVE_STEP * this.rect.w * delta, -m.y * MOVE_STEP * this.rect.h * delta)
    let width = this.rect.w
    let height = this.rect.h

    const delta_sq = (ZOOM_BASE - 1) * delta + 1
    if (m.zoom > 0) {
      width /= delta_sq
      height /= delta_sq
    } else if (m.zoom < 0) {
      width *= delta_sq
      height *= delta_sq
    }

    this.rect = Rectangle.fromCenter(center, width, height)
    this.emitEvent('move', this)
  }

  protected initRescaleOnResize() {
    window.addEventListener('resize', () => {
      const [prevWidth, prevHeight] = [this.canvas.width, this.canvas.height]

      this.canvas.width = window.innerWidth
      this.canvas.height = window.innerHeight

      const { width, height } = this.canvas

      this.rect = Rectangle.fromCenter(
        this.rect.getCenter(),
        (this.rect.w * width) / prevWidth,
        (this.rect.h * height) / prevHeight,
      )
      this.emitEvent('resize')
    })
  }

  viewportToScreenCoord(p: Point) {
    const basePoint = this.rect.getBasePoint()
    return p
      .translate(-basePoint.x, -basePoint.y)
      .scale(this.canvas.width / this.rect.w, this.canvas.height / this.rect.h)
  }

  viewportToScreenRect(r: Rectangle) {
    const basePoint = this.viewportToScreenCoord(r.getBasePoint())
    const offsetPoint = this.viewportToScreenCoord(r.getOffsetPoint())
    return Rectangle.fromOppositeCorners(basePoint, offsetPoint)
  }

  screenToViewportCoord(p: Point) {
    const basePoint = this.rect.getBasePoint()
    return p
      .scale(this.rect.w / this.canvas.width, this.rect.h / this.canvas.height)
      .translate(basePoint.x, basePoint.y)
  }

  screenToViewportRect(r: Rectangle) {
    const basePoint = this.screenToViewportCoord(r.getBasePoint())
    const offsetPoint = this.screenToViewportCoord(r.getOffsetPoint())
    return Rectangle.fromOppositeCorners(basePoint, offsetPoint)
  }
}
