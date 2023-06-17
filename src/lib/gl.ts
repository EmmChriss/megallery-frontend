import { mat4 } from 'gl-matrix'
import { GraphicsDrawCommand } from './graphics'
import { Point, Rectangle } from './types'
import { measureTime, measureTimeCallback } from './util'

// Vertex shader program
const vsSource = `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat4 uTransformMatrix;

varying highp vec2 vTextureCoord;

void main() {
  gl_Position = uTransformMatrix * aVertexPosition;
  vTextureCoord = aTextureCoord;
}
`

// Fragment shader program
const fsSource = `
varying highp vec2 vTextureCoord;

uniform sampler2D uSampler;

void main() {
  gl_FragColor = texture2D(uSampler, vTextureCoord);
}
`

export interface ProgramData {
  program: WebGLProgram

  attributes: {
    aVertexPosition: number
    aTextureCoord: number
  }
  uniforms: {
    uTransformMatrix: WebGLUniformLocation
    uSampler: WebGLUniformLocation
  }
}

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (shader == null) return null

  // Send the source to the shader object
  gl.shaderSource(shader, source)
  // Compile the shader program
  gl.compileShader(shader)
  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`)
    gl.deleteShader(shader)
    return null
  }

  return shader
}

export function initProgram(gl: WebGLRenderingContext): ProgramData | null {
  const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource)
  if (vs == null) return null

  const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (fs == null) return null

  const prog = gl.createProgram()
  if (prog == null) return null

  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    alert(`Unable to initialize the shader program: ${gl.getProgramInfoLog(prog)}`)
    return null
  }

  const uTransformMatrix = gl.getUniformLocation(prog, 'uTransformMatrix')
  if (uTransformMatrix == null) return null

  const uSampler = gl.getUniformLocation(prog, 'uSampler')
  if (uSampler == null) return null

  const programData = {
    program: prog,
    attributes: {
      aVertexPosition: gl.getAttribLocation(prog, 'aVertexPosition'),
      aTextureCoord: gl.getAttribLocation(prog, 'aTextureCoord'),
    },
    uniforms: { uTransformMatrix, uSampler },
  }

  return programData
}

interface BufferSetIntern {
  textureCoordBuffer: WebGLBuffer
  positionBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
}

type BufferSet = number

const bufferSetStore = new Array<BufferSetIntern>()

export function createBufferSet(gl: WebGLRenderingContext): BufferSet | null {
  const textureCoordBuffer = gl.createBuffer()
  if (textureCoordBuffer == null) return null

  const positionBuffer = gl.createBuffer()
  if (positionBuffer == null) return null

  const indexBuffer = gl.createBuffer()
  if (indexBuffer == null) return null

  const idx = bufferSetStore.length
  bufferSetStore.push({ textureCoordBuffer, positionBuffer, indexBuffer })

  return idx
}

export function clearBufferSet(gl: WebGLRenderingContext, buffersIdx: BufferSet) {
  const buffers = bufferSetStore[buffersIdx]

  // upload texture coordinates
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoordBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([]), gl.STATIC_DRAW)

  // upload position coordinates
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([]), gl.STATIC_DRAW)

  // upload indices
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([]), gl.STATIC_DRAW)
}

export interface Texture {
  texture: number
  width: number
  height: number

  buffers: BufferSet[]
  instances: { src: Rectangle; dst: Rectangle }[]
}

const textureStore = new Array<WebGLTexture>()

export function getWebGLTexture(texture: Texture): WebGLTexture {
  return textureStore[texture.texture]
}

export function createTexture(gl: WebGLRenderingContext): Texture | null {
  const texture = gl.createTexture()
  if (texture == null) return null

  const bufferSet = createBufferSet(gl)
  if (bufferSet === null) return null

  const textureIdx = textureStore.length
  textureStore.push(texture)

  return {
    texture: textureIdx,
    width: 0,
    height: 0,
    buffers: [bufferSet],
    instances: [],
  }
}

export function initEmptyTexture(
  gl: WebGLRenderingContext,
  texture: Texture,
  width: number,
  height: number,
) {
  gl.bindTexture(gl.TEXTURE_2D, getWebGLTexture(texture))
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  texture.width = width
  texture.height = height
}

const clearFramebufferRef: { current?: WebGLFramebuffer } = {}

export function clearTexture(gl: WebGLRenderingContext, texture: Texture) {
  if (!clearFramebufferRef.current) {
    const fb = gl.createFramebuffer()
    if (!fb) throw new Error('Could not create framebuffer')

    clearFramebufferRef.current = fb
  }

  gl.bindTexture(gl.TEXTURE_2D, getWebGLTexture(texture))
  gl.bindFramebuffer(gl.FRAMEBUFFER, clearFramebufferRef.current)

  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    getWebGLTexture(texture),
    0,
  )
  gl.clear(gl.COLOR_BUFFER_BIT)

  // unbind everything
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

export function uploadTexture(
  gl: WebGLRenderingContext,
  source: TexImageSource,
  texture: WebGLTexture,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
}

export function uploadSubTexture(
  gl: WebGLRenderingContext,
  source: TexImageSource,
  texture: WebGLTexture,
  position: Point,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, position.x, position.y, gl.RGBA, gl.UNSIGNED_BYTE, source)
}

const VERTICES_PER_BUFFER_SET = 98304

export function updateBuffers(
  gl: WebGLRenderingContext,
  drawCommands: GraphicsDrawCommand[],
): Texture[] {
  const clockBufferGen = measureTimeCallback('buffer gen', 1)

  const cmdsByTexture: Map<Texture, GraphicsDrawCommand[]> = new Map()
  for (const cmd of drawCommands) {
    const cmds = cmdsByTexture.get(cmd.texture) || []
    cmds.push(cmd)
    cmdsByTexture.set(cmd.texture, cmds)
  }

  for (const texture of cmdsByTexture.keys()) {
    // compare previous and current instances to not draw when not necessary
    const instances = cmdsByTexture
      .get(texture)!
      .map(cmd => Object.assign({ src: cmd.src, dst: cmd.dst }))

    let isEq = true
    if (texture.instances.length != instances.length) isEq = false
    if (isEq) {
      for (let idx = 0; idx < texture.instances.length; idx += 1) {
        const a = texture.instances[idx]
        const b = instances[idx]

        if (a.src != b.src || a.dst != b.dst) {
          isEq = false
          break
        }
      }
    }

    // if they are equal, don't bother
    if (isEq) continue
    texture.instances = instances

    const cmds = cmdsByTexture.get(texture)!
    const bufferSetsNeeded = Math.ceil((cmds.length * 6) / VERTICES_PER_BUFFER_SET)

    // if we are missing buffer sets, create them
    while (texture.buffers.length < bufferSetsNeeded) {
      const buffers = createBufferSet(gl)
      if (!buffers) throw new Error('could not create buffer set')

      texture.buffers.push(buffers)
    }

    // fill each buffer set
    for (let bufferSetIdx = 0; bufferSetIdx < bufferSetsNeeded; bufferSetIdx++) {
      const offset = (bufferSetIdx * VERTICES_PER_BUFFER_SET) / 6
      const current =
        bufferSetIdx + 1 === bufferSetsNeeded
          ? cmds.length % (VERTICES_PER_BUFFER_SET / 6)
          : VERTICES_PER_BUFFER_SET / 6

      // const textureCoordBuf: number[] = []
      // const positionBuf: number[] = []
      // const indexBuf: number[] = []
      const textureCoordBuf = new Float32Array(current * 8)
      const positionBuf = new Float32Array(current * 8)
      const indexBuf = new Uint16Array(current * 6)

      let i = 0

      for (let j = 0; j < current; j++) {
        const cmd = cmds[offset + j]

        // append texture coordinates
        const m = cmd.src
        const c = [
          m.y / texture.height, // T
          m.x / texture.width, // L
          (m.y + m.h) / texture.height, // B
          (m.x + m.w) / texture.width, // R
        ]
        textureCoordBuf[j * 8 + 0] = c[3]
        textureCoordBuf[j * 8 + 1] = c[0] // TR
        textureCoordBuf[j * 8 + 2] = c[1]
        textureCoordBuf[j * 8 + 3] = c[0] // TL
        textureCoordBuf[j * 8 + 4] = c[3]
        textureCoordBuf[j * 8 + 5] = c[2] // BR
        textureCoordBuf[j * 8 + 6] = c[1]
        textureCoordBuf[j * 8 + 7] = c[2] // BL

        // append position coordinates
        const p = [
          cmd.dst.y + cmd.dst.h, // T
          cmd.dst.x, // L
          cmd.dst.y, // B
          cmd.dst.x + cmd.dst.w, // R
        ]
        positionBuf[j * 8 + 0] = p[3]
        positionBuf[j * 8 + 1] = p[0] // TR
        positionBuf[j * 8 + 2] = p[1]
        positionBuf[j * 8 + 3] = p[0] // TL
        positionBuf[j * 8 + 4] = p[3]
        positionBuf[j * 8 + 5] = p[2] // BR
        positionBuf[j * 8 + 6] = p[1]
        positionBuf[j * 8 + 7] = p[2] // BL

        // append indices
        indexBuf[j * 6 + 0] = i + 0
        indexBuf[j * 6 + 1] = i + 1
        indexBuf[j * 6 + 2] = i + 2
        indexBuf[j * 6 + 3] = i + 3
        indexBuf[j * 6 + 4] = i + 2
        indexBuf[j * 6 + 5] = i + 1
        i += 4
      }

      const buffers = bufferSetStore[texture.buffers[bufferSetIdx]]

      // upload texture coordinates
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoordBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, textureCoordBuf, gl.STATIC_DRAW)

      // upload position coordinates
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, positionBuf, gl.STATIC_DRAW)

      // upload indices
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuf, gl.STATIC_DRAW)
    }
  }

  clockBufferGen()

  return [...cmdsByTexture.keys()]
}

export function draw(
  gl: WebGLRenderingContext,
  programData: ProgramData,
  textures: Texture[],
  canvas: HTMLCanvasElement,
  viewport: Rectangle,
  visibleTextures: Set<Texture>,
) {
  const clockDraw = measureTimeCallback('draw', 1)

  gl.viewport(0, 0, canvas.width, canvas.height)

  gl.clearColor(1.0, 1.0, 1.0, 1.0)
  gl.clearDepth(1.0)

  gl.enable(gl.DEPTH_TEST) // Enable depth testing
  gl.depthFunc(gl.LEQUAL) // Near things obscure far things

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  // Create a perspective matrix
  const zNear = 0.1
  const zFar = 100.0
  const transformMatrix = mat4.create()

  const center = viewport.getCenter()

  mat4.ortho(
    transformMatrix,
    -viewport.w / 2,
    viewport.w / 2,
    -viewport.h / 2,
    viewport.h / 2,
    zNear,
    zFar,
  )
  mat4.translate(transformMatrix, transformMatrix, [-center.x, -center.y, -10])

  for (const texture of textures) {
    if (visibleTextures.size > 0 && !visibleTextures.has(texture)) continue

    let remainingVertices = texture.instances.length * 6

    texture.buffers.forEach((bufferIdx, idx) => {
      const buffers = bufferSetStore[bufferIdx]
      const isLast = idx + 1 === texture.buffers.length
      const currentVertices = isLast ? remainingVertices : VERTICES_PER_BUFFER_SET
      remainingVertices -= currentVertices

      // eslint-disable-next-line
      {
        // Tell WebGL how to pull out the positions from the position
        // buffer into the vertexPosition attribute.
        const numComponents = 2 // pull out 2 values per iteration
        const type = gl.FLOAT // the data in the buffer is 32bit floats
        const normalize = false // don't normalize
        const stride = 0 // how many bytes to get from one set of values to the next
        // 0 = use type and numComponents above
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer)
        gl.vertexAttribPointer(
          programData.attributes.aVertexPosition,
          numComponents,
          type,
          normalize,
          stride,
          0,
        )
        gl.enableVertexAttribArray(programData.attributes.aVertexPosition)
      }

      // eslint-disable-next-line
      {
        // Tell WebGL how to pull out the positions from the texture coord buffer
        const num = 2 // every coordinate composed of 2 values
        const type = gl.FLOAT // the data in the buffer is 32-bit float
        const normalize = false // don't normalize
        const stride = 0 // how many bytes to get from one set to the next
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoordBuffer)
        gl.vertexAttribPointer(
          programData.attributes.aTextureCoord,
          num,
          type,
          normalize,
          stride,
          0,
        )
        gl.enableVertexAttribArray(programData.attributes.aTextureCoord)
      }

      // Tell WebGL which indices to use to index the vertices
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer)

      // Tell WebGL to use our program when drawing
      gl.useProgram(programData.program)

      // Set the shader uniforms
      gl.uniformMatrix4fv(programData.uniforms.uTransformMatrix, false, transformMatrix)

      // eslint-disable-next-line
      {
        // Tell WebGL we want to affect texture unit 0
        gl.activeTexture(gl.TEXTURE0)

        // Bind the texture to texture unit 0
        gl.bindTexture(gl.TEXTURE_2D, getWebGLTexture(texture))

        // Tell the shader we bound the texture to texture unit 0
        gl.uniform1i(programData.uniforms.uSampler, 0)
      }

      // eslint-disable-next-line
      {
        gl.drawElements(gl.TRIANGLES, currentVertices, gl.UNSIGNED_SHORT, 0)
      }
    })
  }

  clockDraw()
}
