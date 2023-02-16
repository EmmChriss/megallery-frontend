import React, { useRef, useEffect, useMemo } from 'react'
import { getImageData, getImageDataByIds, getImageMetadata } from './api'
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
    if (gl === null || metadata.length === 0) return

    const totalArea = metadata.map(m => m.width * m.height).reduce((p, c) => p + c, 0)
    const availableArea = window.screen.width * window.screen.height
    const ratio = Math.sqrt(availableArea) / Math.sqrt(totalArea)

    const maxWidth = metadata.map(m => m.width * ratio).reduce((p, c) => Math.max(p, c), 0)
    const maxHeight = metadata.map(m => m.height * ratio).reduce((p, c) => Math.max(p, c), 0)

    const glTextureSizeLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    // const glTextureArraySizeLimit = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number

    // get top-level image sizes
    getImageData({
      // icon_max_width: Math.round(maxWidth),
      // icon_max_height: Math.round(maxHeight),
      icon_max_width: 150,
      icon_max_height: 150,
      atlas_max_area: glTextureSizeLimit * glTextureSizeLimit,
    })
      .then(imageData => {
        const textureAtlas = {
          mapping: imageData.mapping,
          width: imageData.atlas.width,
          height: imageData.atlas.height,
        }
        loadTexture(imageData.atlas, textureAtlas)
      })
      .then(_ => {
        console.log('new api, no overall texture size limit')
        const req = metadata.map(m =>
          Object.assign(
            {},
            {
              id: m.id,
              max_width: 150,
              max_height: 150,
            },
          ),
        )
        getImageDataByIds(req)
          .then(a => console.log(a.length))
          .catch(e => console.error(e))
      })
  }, [gl, metadata])

  return <canvas ref={ref} width={window.innerWidth} height={window.innerHeight} />
}

export default App
