import React, { useRef, useEffect, useState, useMemo } from 'react'
import { ApiImage, getImageData, getImageMetadata } from './api'
import { useGraphics, useViewport } from "./graphics"
import { createGridLayout } from './layout'
import { useKeyboardMovement } from './movement'
import { measureTimeCallback } from './util'

const App = () => {
  const ref = useRef<HTMLCanvasElement>(null)

  const [metadata, setMetadata] = useState<ApiImage[]>([])
  const [viewport, setViewport] = useViewport()
  const layout = useMemo(() => {
    if (!metadata)
      return []

    return createGridLayout(metadata)
  }, [metadata])
  const { gl, loadTexture } = useGraphics(ref.current, layout, viewport)

  // use keyboard to navigate
  useKeyboardMovement(setViewport)

  // query metadata
  useEffect(() => {
    if (metadata.length !== 0)
      return

    const metadataClock = measureTimeCallback("fetching metadata", 1)
    
    getImageMetadata()
      .then(meta => setMetadata(meta))
      .then(_ => metadataClock())
      .catch(console.error)
  }, [metadata.length])


  const fetchImages = (images: ApiImage[], targetArea: number) => {
    if (!gl)
      return
    
    const ids = images.map(m => m.id)

    const totalArea = images.map(m => m.width * m.height).reduce((p, c) => p + c, 0)
    const ratio = Math.sqrt(targetArea) / Math.sqrt(totalArea)

    const maxWidth = images.map(m => m.width * ratio).reduce((p, c) => Math.max(p, c), 0)
    const maxHeight = images.map(m => m.height * ratio).reduce((p, c) => Math.max(p, c), 0)

    const glTextureSizeLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number

    getImageData({
      id_list: ids,
      icon_max_width: Math.trunc(maxWidth),
      icon_max_height: Math.trunc(maxHeight),
      atlas_max_area: glTextureSizeLimit * glTextureSizeLimit, 
    }).then(imageData => {
      const textureAtlas = { mapping: imageData.mapping, width: imageData.atlas.width, height: imageData.atlas.height };
      loadTexture(imageData.atlas, textureAtlas)
    })
  }

  // after gl init, start fetching images
  useEffect(() => {
    if (gl == null || metadata.length == 0)
      return

    const totalArea = metadata.map(m => m.width * m.height).reduce((p, c) => p + c, 0)
    const availableArea = window.screen.width * window.screen.height
    const ratio = Math.sqrt(availableArea) / Math.sqrt(totalArea)
    console.log(totalArea, availableArea, ratio)
    
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
      const textureAtlas = { mapping: imageData.mapping, width: imageData.atlas.width, height: imageData.atlas.height };
      loadTexture(imageData.atlas, textureAtlas)
    })
    .then(_ => {
      setTimeout(() => {
        console.log('started second round')
        fetchImages(metadata.slice(0, metadata.length / 2), availableArea * 2)
      }, 3000)
    })
  }, [gl, metadata])

  return (<canvas ref={ref} width={window.innerWidth} height={window.innerHeight} />)
}

export default App;
