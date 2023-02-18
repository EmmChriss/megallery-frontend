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

export interface GLData {
  textureCoordBuffer: WebGLBuffer
  positionBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer

  programData: ProgramData
}

export function initGLData(gl: WebGL2RenderingContext): GLData | null {
  const textureCoordBuffer = gl.createBuffer()
  if (textureCoordBuffer == null) return null

  const positionBuffer = gl.createBuffer()
  if (positionBuffer == null) return null

  const indexBuffer = gl.createBuffer()
  if (indexBuffer == null) return null

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

  return {
    textureCoordBuffer,
    positionBuffer,
    indexBuffer,
    programData,
  }
}

export function uploadTexture(gl: WebGL2RenderingContext, source: TexImageSource, texture: WebGLTexture) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source)

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
}

export function uploadSubTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
  texture: WebGLTexture,
  position: Point,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, position.x, position.y, gl.RGB, gl.UNSIGNED_BYTE, source)
}

export interface Texture {
  texture: WebGLTexture
  width: number
  height: number
}

export interface DrawParams {
  texture: Texture
  offset: number
  vertexCount: number
}

export function updateBuffers(
  gl: WebGLRenderingContext,
  glData: GLData,
  drawCommands: GraphicsDrawCommand[],
): DrawParams[] {
  const clockBufferGen = measureTimeCallback('buffer gen', 1)

  // update coordinates
  const textureCoordBuf: number[] = []
  const positionBuf: number[] = []
  const indexBuf: number[] = []
  var i = 0

  const cmdsByTexture: Map<Texture, GraphicsDrawCommand[]> = new Map()
  for (const cmd of drawCommands) {
    const cmds = cmdsByTexture.get(cmd.texture) || []
    cmds.push(cmd)
    cmdsByTexture.set(cmd.texture, cmds)
  }

  const drawParams: DrawParams[] = []
  for (const texture of cmdsByTexture.keys()) {
    const cmds = cmdsByTexture.get(texture)!
    drawParams.push({
      texture,
      offset: i / 4,
      vertexCount: cmds.length * 6,
    })

    for (const cmd of cmds) {
      // append texture coordinates
      const m = cmd.src
      const c = [
        m.y / texture.height, // T
        m.x / texture.width, // L
        (m.y + m.h) / texture.height, // B
        (m.x + m.w) / texture.width, // R
      ]
      const coords = [
        c[3],
        c[0], // TR
        c[1],
        c[0], // TL
        c[3],
        c[2], // BR
        c[1],
        c[2], // BL
      ]
      textureCoordBuf.push(...coords)

      // append position coordinates
      const p = [
        cmd.dst.y + cmd.dst.h, // T
        cmd.dst.x, // L
        cmd.dst.y, // B
        cmd.dst.x + cmd.dst.w, // R
      ]
      const positions = [
        p[3],
        p[0], // TR
        p[1],
        p[0], // TL
        p[3],
        p[2], // BR
        p[1],
        p[2], // BL
      ]
      positionBuf.push(...positions)

      // append indices
      const indices = [i + 0, i + 1, i + 2, i + 3, i + 2, i + 1]
      indexBuf.push(...indices)
      i += 4
    }
  }

  clockBufferGen()

  measureTime('buffer upload', 1, () => {
    // upload texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, glData.textureCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordBuf), gl.STATIC_DRAW)

    // upload position coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, glData.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionBuf), gl.STATIC_DRAW)

    // upload indices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glData.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexBuf), gl.STATIC_DRAW)
  })
  console.log(
    `uploaded ${drawCommands.length} cmd ${textureCoordBuf.length} texcoord ${positionBuf.length} pos ${indexBuf.length} idx`,
  )

  return drawParams
}

export function draw(
  gl: WebGL2RenderingContext,
  glData: GLData,
  drawParams: DrawParams[],
  canvas: HTMLCanvasElement,
  viewport: Rectangle,
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

  mat4.ortho(transformMatrix, -viewport.w / 2, viewport.w / 2, -viewport.h / 2, viewport.h / 2, zNear, zFar)
  mat4.translate(transformMatrix, transformMatrix, [-center.x, -center.y, -10])

  for (const { texture, offset, vertexCount } of drawParams) {
    // eslint-disable-next-line
    {
      // Tell WebGL how to pull out the positions from the position
      // buffer into the vertexPosition attribute.
      const numComponents = 2 // pull out 2 values per iteration
      const type = gl.FLOAT // the data in the buffer is 32bit floats
      const normalize = false // don't normalize
      const stride = 0 // how many bytes to get from one set of values to the next
      // 0 = use type and numComponents above
      gl.bindBuffer(gl.ARRAY_BUFFER, glData.positionBuffer)
      gl.vertexAttribPointer(
        glData.programData.attributes.aVertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset * 8 * 4,
      )
      gl.enableVertexAttribArray(glData.programData.attributes.aVertexPosition)
    }

    // eslint-disable-next-line
    {
      // Tell WebGL how to pull out the positions from the texture coord buffer
      const num = 2 // every coordinate composed of 2 values
      const type = gl.FLOAT // the data in the buffer is 32-bit float
      const normalize = false // don't normalize
      const stride = 0 // how many bytes to get from one set to the next
      gl.bindBuffer(gl.ARRAY_BUFFER, glData.textureCoordBuffer)
      gl.vertexAttribPointer(glData.programData.attributes.aTextureCoord, num, type, normalize, stride, offset * 8 * 4)
      gl.enableVertexAttribArray(glData.programData.attributes.aTextureCoord)
    }

    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glData.indexBuffer)

    // Tell WebGL to use our program when drawing
    gl.useProgram(glData.programData.program)

    // Set the shader uniforms
    gl.uniformMatrix4fv(glData.programData.uniforms.uTransformMatrix, false, transformMatrix)

    // eslint-disable-next-line
    {
      // Tell WebGL we want to affect texture unit 0
      gl.activeTexture(gl.TEXTURE0)

      // Bind the texture to texture unit 0
      gl.bindTexture(gl.TEXTURE_2D, texture.texture)

      // Tell the shader we bound the texture to texture unit 0
      gl.uniform1i(glData.programData.uniforms.uSampler, 0)
    }

    // eslint-disable-next-line
    {
      gl.drawElements(gl.TRIANGLES, vertexCount, gl.UNSIGNED_SHORT, offset * 6 * 2)
    }
  }

  clockDraw()
}
