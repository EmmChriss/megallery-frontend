import React, { useRef, useEffect, useMemo, useState } from 'react'
import { mat4 } from 'gl-matrix'
import { decode as decodePng } from 'fast-png'
import { decode as decodeMsgPack } from "@msgpack/msgpack"
import { Clock } from "./util"

const BASE_URL = "http://localhost:37371"

export type Props = {
  width: number,
  height: number
}

interface ImageResponse {
  metadata: { name: string, width: number, height: number, x: number, y: number }[],
  width: number,
  height: number,
  data: Uint8Array,
}

// Vertex shader program
const vsSource = `
  attribute vec4 aVertexPosition;
  attribute vec2 aTextureCoord;

  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;

  varying highp vec2 vTextureCoord;

  void main() {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vTextureCoord = aTextureCoord;
  }
`;

// Fragment shader program
const fsSource = `
  varying highp vec2 vTextureCoord;

  uniform sampler2D uSampler;

  void main() {
    gl_FragColor = texture2D(uSampler, vTextureCoord);
    // gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  }
`;

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (shader == null)
    return null

  // Send the source to the shader object
  gl.shaderSource(shader, source);
  // Compile the shader program
  gl.compileShader(shader);
  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

const ZOOM_BASE = 1.005

const LOAD_CLOCK = new Clock()

const Canvas = ({width, height}: Props) => {
  const ref = useRef<HTMLCanvasElement>(null)

  const gl = useMemo(() => {
    if (ref.current == null)
      return null

    const gl = ref.current.getContext('webgl')
    if (gl == null) {
      alert("Your browser is not supported")
      return null
    }

    return gl
  }, [ref.current])

  const glData = useMemo(() => {
    if (gl == null) {
      return null
    } else {
      const texture = gl.createTexture()
      if (texture == null)
        return null
      
      const textureCoordBuffer = gl.createBuffer()
      if (textureCoordBuffer == null)
        return null

      const positionBuffer = gl.createBuffer()
      if (textureCoordBuffer == null)
        return null

      const indexBuffer = gl.createBuffer()
      if (indexBuffer == null)
        return null

      const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource)
      if (vs == null)
        return null

      const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource)
      if (fs == null)
        return null

      const prog = gl.createProgram();
      if (prog == null)
        return null

      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        alert(`Unable to initialize the shader program: ${gl.getProgramInfoLog(prog)}`);
        return null;
      }

      const programData = {
        program: prog,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(prog, "aVertexPosition"),
          textureCoord: gl.getAttribLocation(prog, "aTextureCoord"),
        },
        uniformLocations: {
          projectionMatrix: gl.getUniformLocation(prog, "uProjectionMatrix"),
          modelViewMatrix: gl.getUniformLocation(prog, "uModelViewMatrix"),
          uSampler: gl.getUniformLocation(prog, "uSampler"),
        },
      };

      return { texture, textureCoordBuffer, positionBuffer, indexBuffer, programData }
    }
  }, [gl])

  const [response, setResponse] = useState<ImageResponse | null>(null)
  const [texturePlacement, setTexturePlacement] = useState<{ idx: number, tlbr: number[] }[]>([])

  useEffect(() => {
    if (response == null)
      return

    const a = Math.trunc(Math.sqrt(response.metadata.length))
    const placement = Array.from(Array(response.metadata.length), (_, i) => {
      const _i = i % a
      const _j = Math.trunc(i / a)
      const wh = response.metadata[i].width / response.metadata[i].height

      let width = 100
      let height = 100
      if (wh > 1) {
        height /= wh
      } else {
        width *= wh
      }
      
      return {
        idx: i,
        tlbr: [110 * _i + height, 110 * _j, 110 * _i, 110 * _j + width]
      }
    })
    setTexturePlacement(placement)
  }, [response])

  const [viewport, setViewport] = useState({
    translate: [0, 0],
    zoom: 0
  })

  const onKeyDown = (ev: KeyboardEvent) => {
    const vp = viewport

    // movement
    if (ev.key == "w") {
      vp.translate[1] -= 10 / Math.pow(ZOOM_BASE, vp.zoom)
    }
    if (ev.key == "s") {
      vp.translate[1] += 10 / Math.pow(ZOOM_BASE, vp.zoom)
    }
    if (ev.key == "a") {
      vp.translate[0] += 10 / Math.pow(ZOOM_BASE, vp.zoom)
    }
    if (ev.key == "d") {
      vp.translate[0] -= 10 / Math.pow(ZOOM_BASE, vp.zoom)
    }

    // zoom
    if (ev.key == "e") {
      vp.zoom += 1
    }
    if (ev.key == "q") {
      vp.zoom -= 1
    }

    setViewport(vp)
    drawScene()
  }

  useEffect(() => {
    if (ref.current == null)
      return

    window.removeEventListener("keydown", onKeyDown)
    window.addEventListener("keydown", onKeyDown)
  }, [onKeyDown])

  useEffect(drawScene, [viewport, width, height])

  // after gl init, start fetching images
  useEffect(() => {
    if (gl == null)
      return

    LOAD_CLOCK.start()

    // start fetching images
    fetch(`${BASE_URL}/images/data?width=200&height=200`)
      .then((fo) => fo.arrayBuffer())
      .then((buf) => decodeMsgPack(buf))
      .then((doc) => setResponse(doc as ImageResponse))
      .then(() => LOAD_CLOCK.print_time("server response"))
      .catch(console.error)
  }, [gl])

  // after fetch, create texture
  useEffect(() => {
    if (gl == null || glData == null || response == null)
      return

    LOAD_CLOCK.start()

    // decode image into buffer
    const image = decodePng(response.data); // return as Uint8Array

    LOAD_CLOCK.print_time("texture decode")

    LOAD_CLOCK.start()

    // Flip image pixels into the bottom-to-top order that WebGL expects.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // fill texture with data and configure it
    gl.bindTexture(gl.TEXTURE_2D, glData.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, response.width, response.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.data);
    // gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    LOAD_CLOCK.print_time("texture upload")
    
  }, [gl, glData, response])

  // after fetch, on update, create buffer data
  useEffect(() => {
    if (gl == null || glData == null || response == null)
      return

    LOAD_CLOCK.start()

    // update coordinates
    const textureCoordBuf: number[] = []
    const positionBuf: number[] = []
    const indexBuf: number[] = []
    var i = 0
    for (const tp of texturePlacement) {
      const metadata = response.metadata[tp.idx]

      // append texture coordinates
      const m = {
        y: response.height - metadata.y,
        x: metadata.x,
        w: metadata.width,
        h: metadata.height
      }
      const c = [
        m.x / response.width, // L
        m.y / response.height, // T
        (m.x + m.w) / response.width, // R
        (m.y - m.h) / response.height, // B
      ]
      const coords = [
        c[2], c[1], // TR
        c[0], c[1], // TL
        c[2], c[3], // BR
        c[0], c[3], // BL
      ]
      textureCoordBuf.push(...coords)

      // append position coordinates
      const p = tp.tlbr;
      const positions = [
        p[3], p[0], // TR
        p[1], p[0], // TL
        p[3], p[2], // BR
        p[1], p[2], // BL
      ]
      positionBuf.push(...positions)

      // append indices
      const indices = [
        i + 0,
        i + 1,
        i + 2,
        i + 1,
        i + 3,
        i + 2,
      ]
      indexBuf.push(...indices)
      i += 4
    }

    LOAD_CLOCK.print_time("buffer gen")

    LOAD_CLOCK.start()

    // upload texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, glData.textureCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordBuf), gl.STATIC_DRAW)

    // upload position coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, glData.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionBuf), gl.STATIC_DRAW)

    // upload indices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glData.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexBuf), gl.STATIC_DRAW)

    LOAD_CLOCK.print_time("buffer upload")

    drawScene()
  }, [gl, glData, texturePlacement, response])

  function drawScene() {
    if (gl == null || glData == null || response == null)
      return

    LOAD_CLOCK.start()

    gl.viewport(0, 0, width, height)
    
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clearDepth(1.0); // Clear everything
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix
    const zNear = 0.1;
    const zFar = 100.0;
    const projectionMatrix = mat4.create();

    const z = Math.pow(ZOOM_BASE, viewport.zoom)
    
    mat4.ortho(projectionMatrix, -width / 2, width / 2, -height / 2, height / 2, zNear, zFar)
    mat4.scale(
      projectionMatrix,
      projectionMatrix,
      [z, z, 1]
    )
    mat4.translate(
      projectionMatrix,
      projectionMatrix,
      [viewport.translate[0], viewport.translate[1], -10]
    )

    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    const modelViewMatrix = mat4.create();

    LOAD_CLOCK.print_time("matrix calculation")

    LOAD_CLOCK.start()

    {
      // Tell WebGL how to pull out the positions from the position
      // buffer into the vertexPosition attribute.
      const numComponents = 2; // pull out 2 values per iteration
      const type = gl.FLOAT; // the data in the buffer is 32bit floats
      const normalize = false; // don't normalize
      const stride = 0; // how many bytes to get from one set of values to the next
      // 0 = use type and numComponents above
      const offset = 0; // how many bytes inside the buffer to start from
      gl.bindBuffer(gl.ARRAY_BUFFER, glData.positionBuffer);
      gl.vertexAttribPointer(
        glData.programData.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset
      );
      gl.enableVertexAttribArray(glData.programData.attribLocations.vertexPosition);
    }

    {
      // Tell WebGL how to pull out the positions from the texture coord buffer
      const num = 2; // every coordinate composed of 2 values
      const type = gl.FLOAT; // the data in the buffer is 32-bit float
      const normalize = false; // don't normalize
      const stride = 0; // how many bytes to get from one set to the next
      const offset = 0; // how many bytes inside the buffer to start from
      gl.bindBuffer(gl.ARRAY_BUFFER, glData.textureCoordBuffer);
      gl.vertexAttribPointer(
        glData.programData.attribLocations.textureCoord,
        num,
        type,
        normalize,
        stride,
        offset
      );
      gl.enableVertexAttribArray(glData.programData.attribLocations.textureCoord);
    }

    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glData.indexBuffer)

    // Tell WebGL to use our program when drawing
    gl.useProgram(glData.programData.program);

    // Set the shader uniforms
    gl.uniformMatrix4fv(
      glData.programData.uniformLocations.projectionMatrix,
      false,
      projectionMatrix
    );
    gl.uniformMatrix4fv(
      glData.programData.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix
    );

    {
      // Tell WebGL we want to affect texture unit 0
      gl.activeTexture(gl.TEXTURE0);

      // Bind the texture to texture unit 0
      gl.bindTexture(gl.TEXTURE_2D, glData.texture);

      // Tell the shader we bound the texture to texture unit 0
      gl.uniform1i(glData.programData.uniformLocations.uSampler, 0);
    }

    LOAD_CLOCK.print_time("data binding")

    LOAD_CLOCK.start()

    {
      const offset = 0;
      const vertexCount = 6 * texturePlacement.length
      // gl.drawArrays(gl.TRIANGLES, offset, vertexCount);
      gl.drawElements(gl.TRIANGLES, vertexCount, gl.UNSIGNED_SHORT, offset)
    }

    LOAD_CLOCK.print_time("draw")
  }
  
  return (<canvas ref={ref} width={width} height={height} />)
}

export default Canvas
