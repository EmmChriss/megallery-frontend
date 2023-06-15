import { Texture, ProgramData } from './gl'
import { Rectangle } from './types'

export interface GLContext {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  programData: ProgramData
}

export interface GraphicsDrawCommand {
  id: string
  texture: Texture
  src: Rectangle
  dst: Rectangle
}
