import { ApiCollection, ApiImage, getImageMetadata, getImages, ImageMetadata } from './api'
import { EventHandler } from './eventHandler'
import { draw as drawGL, initProgram, Texture, updateBuffers } from './gl'
import { GLContext } from './graphics'
import { Organizer } from './layout'
import { Selector } from './selector'
import { TextureStore } from './store'
import { Viewport } from './viewport'
import { createWorker } from './worker'

interface AppEventMap {
  'on-after-render': () => void
  'changed-collection': (collection?: ApiCollection) => void
  'changed-images': (images: Map<string, ApiImage>, metadata: Map<string, ImageMetadata>) => void
}

export class App extends EventHandler<AppEventMap> {
  canvas: HTMLCanvasElement
  drawing = false

  textureStore: TextureStore
  organizer: Organizer
  selector: Selector

  collection?: ApiCollection
  images: Map<string, ApiImage> = new Map()
  metadata: Map<string, ImageMetadata> = new Map()

  viewport: Viewport
  glContext: GLContext

  worker = createWorker()

  drawCalls: Texture[] = []

  constructor(canvas: HTMLCanvasElement) {
    super()

    this.canvas = canvas

    const glContext = this.initGLContext()
    if (!glContext) throw Error('Could not initialize GLContext')

    this.glContext = glContext

    this.organizer = new Organizer(this)

    this.viewport = new Viewport(this)

    this.textureStore = new TextureStore(this, this.glContext)
    this.textureStore.addEventListener(
      'changed-graphics-draw-commands',
      gdc => (this.drawCalls = updateBuffers(this.glContext!.gl, gdc)),
    )

    this.selector = new Selector(this)

    this.addEventListener('changed-collection', collection => {
      this.drawing = collection !== undefined
    })

    this.openCollection({ name: '', id: '52edbd3b-0f3f-468f-a90d-eafab093281e' })

    // kickstart frame-draw loop
    this.draw()
  }

  openCollection(collection: ApiCollection) {
    this.collection = collection
    this.loadImages()

    this.emitEvent('changed-collection', collection)
  }

  closeCollection() {
    this.collection = undefined
    this.emitEvent('changed-collection')
  }

  async loadImages() {
    if (!this.collection) return

    const images = await getImages(this.collection.id)

    this.images.clear()
    images.forEach(m => {
      this.images.set(m.id, m)
    })

    const metadata = await getImageMetadata(this.collection.id)

    this.metadata.clear()
    for (const id of Object.keys(metadata)) {
      this.metadata.set(id, Object.assign(metadata[id], { id: id }))
    }

    this.emitEvent('changed-images', this.images, this.metadata)
  }

  initGLContext(): GLContext | undefined {
    const gl = this.canvas.getContext('webgl2')
    if (gl == null) throw Error('Your browser is not supported')

    const programData = initProgram(gl)
    if (programData == null) throw Error('Could not initialize OpenGL buffers')

    return {
      gl,
      canvas: this.canvas,
      programData,
    }
  }

  draw() {
    requestAnimationFrame(this.draw.bind(this))

    if (this.drawing && this.drawCalls.length !== 0) {
      this.viewport.move()
      drawGL(
        this.glContext.gl,
        this.glContext.programData,
        this.drawCalls,
        this.canvas,
        this.viewport.rect,
        this.textureStore.visibleTextures,
      )

      this.emitEvent('on-after-render')
    }
  }
}
