import { App } from './app'
import { EventHandler } from './eventHandler'
import { GraphicsDrawCommand } from './graphics'
import { CollisionGrid, DrawCommand } from './store'

interface SelectorEventMap {
  'changed-selected': (selected?: GraphicsDrawCommand) => void
}

export class Selector extends EventHandler<SelectorEventMap> {
  selected?: GraphicsDrawCommand

  collisionGrid?: CollisionGrid

  constructor(app: App) {
    super()

    app.organizer.addEventListener('changed-layout', _ => {
      this.selected = undefined
    })

    app.textureStore.addEventListener('changed-collision-grid', collisionGrid => {
      this.collisionGrid = collisionGrid
    })

    app.viewport.addEventListener('click', p => {
      if (this.collisionGrid === undefined) return

      const gdcs = this.collisionGrid.collisionsCoord(p)

      if (gdcs.length > 0) {
        this.selected = gdcs[0]
      } else {
        this.selected = undefined
      }

      this.emitEvent('changed-selected', this.selected)
    })
  }
}
