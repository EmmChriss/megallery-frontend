import React, { useRef, useEffect, useState, useMemo } from 'react'
import { getImageData, getImageMetadata } from './api'
import { useGraphics, useViewport } from './graphics'
import { createGridLayout } from './layout'
import { useKeyboardMovement } from './movement'
import { measureTimeAsync, useQuery } from './util'

const App = () => {
  const ref = useRef<HTMLCanvasElement>(null)

  const [metadata] = useQuery(() => measureTimeAsync('fetching metadata', 1, getImageMetadata()), [])
  const [viewport, setViewport] = useViewport()
  const layout = useMemo(() => createGridLayout(metadata), [metadata])
  const { gl, loadTexture } = useGraphics(ref.current, layout, viewport)

  // use keyboard to navigate
  useKeyboardMovement(setViewport)

  // after gl init, start fetching images
  useEffect(() => {
    if (gl == null || metadata.length == 0) return

    const totalArea = metadata.map(m => m.width * m.height).reduce((p, c) => p + c, 0)
    const availableArea = window.screen.width * window.screen.height
    const ratio = Math.sqrt(availableArea) / Math.sqrt(totalArea)

    const maxWidth = metadata.map(m => m.width * ratio).reduce((p, c) => Math.max(p, c), 0)
    const maxHeight = metadata.map(m => m.height * ratio).reduce((p, c) => Math.max(p, c), 0)

    const glTextureSizeLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    // const glTextureArraySizeLimit = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number

    // get top-level image sizes
    getImageData({
      icon_max_width: Math.round(maxWidth),
      icon_max_height: Math.round(maxHeight),
      atlas_max_area: glTextureSizeLimit * glTextureSizeLimit,
    }).then(imageData => {
      const textureAtlas = {
        mapping: imageData.mapping,
        width: imageData.atlas.width,
        height: imageData.atlas.height,
      }
      loadTexture(imageData.atlas, textureAtlas)
    })
  }, [gl, metadata])

  return <canvas ref={ref} width={window.innerWidth} height={window.innerHeight} />
}

export default App
