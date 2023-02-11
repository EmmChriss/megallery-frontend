import React, { useRef, useEffect, useState } from 'react'
import { ApiImage, getImageData, getImageMetadata } from './api'
import { DrawCommand, useGraphics } from "./graphics"
import { useKeyboardMovement } from './movement'
import { Rectangle } from './types'
import { measureTimeCallback } from './util'

export type Props = {
  width: number,
  height: number
}

const Canvas = ({width, height}: Props) => {
  const ref = useRef<HTMLCanvasElement>(null)

  const [metadata, setMetadata] = useState<ApiImage[]>([])
  const [drawQueue, setDrawQueue] = useState<DrawCommand[]>([])

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

  // generate grid layout
  useEffect(() => {
    if (metadata == null)
      return

    const a = Math.trunc(Math.sqrt(metadata.length))
    const placement = Array.from(Array(metadata.length), (_, i) => {
      const _i = i % a
      const _j = Math.trunc(i / a)
      const wh = metadata[i].width / metadata[i].height

      let width = 100
      let height = 100

      if (wh > 1) {
        height /= wh
      } else {
        width *= wh
      }
      
      return {
        id: metadata[i].id,
        w: width,
        h: height,
        x: 110 * _j,
        y: 110 * _i
      }
    })
    setDrawQueue(placement)
  }, [metadata])

  // viewport state and navigation
  const [viewport, setViewport] = useState<Rectangle>(new Rectangle(0, 0, width, height))

  // on resize, rescale viewport
  useEffect(() => setViewport(viewport => {
    const vp = Object.assign({}, viewport)
    vp.w *= width / viewport.w
    vp.h *= height / viewport.h
    
    return vp
  }), [setViewport, width, height])
  
  useKeyboardMovement(setViewport)

  const {gl, loadTexture} = useGraphics(ref.current, drawQueue, viewport)

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
      loadTexture(imageData.atlas.data, imageData.atlas.channels, textureAtlas)
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
      loadTexture(imageData.atlas.data, imageData.atlas.channels, textureAtlas)
    }).then(_ => {
      setTimeout(() => {
        console.log('started second round')
        fetchImages(metadata.slice(0, metadata.length / 2), availableArea * 2)
      }, 3000)
    })
  }, [gl, metadata])

  // get image sizes based on viewport
  useEffect(() => {
    
  }, [viewport])

  return (<canvas ref={ref} width={width} height={height} />)
}

export default Canvas
