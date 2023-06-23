import { decode } from 'msgpackr'
import { measureTimeCallback } from './util'

export type ApiError = 'FAILED'

const BASE_URL = 'http://localhost:37371'

type ApiImageInternal = [string, number, number]

export interface ApiImage {
  id: string
  width: number
  height: number
}

export function getImages(collection_id: string): Promise<ApiImage[]> {
  return new Promise<ApiImage[]>((resolve, reject) => {
    fetch(`${BASE_URL}/${collection_id}`)
      .then(resp => {
        if (!resp.ok) resp.text().then(reject).catch(reject)
        else return resp.json()
      })
      .then(json =>
        (json as ApiImageInternal[]).map(
          i => Object.assign({ id: i[0], width: i[1], height: i[2] }) as ApiImage,
        ),
      )
      .then(res => resolve(res))
      .catch(reject)
  })
}

interface ApiImageMetadata {
  palette?: [number, number, number][]
  name?: string
  exif?: Record<string, string>
}

export type ImageMetadata = ApiImageMetadata & { id: string }

type ImageMetadataResponse = Record<string, ApiImageMetadata>

export function getImageMetadata(collection_id: string): Promise<ImageMetadataResponse> {
  return new Promise<ImageMetadataResponse>((resolve, reject) => {
    fetch(`${BASE_URL}/${collection_id}/metadata`)
      .then(resp => {
        if (!resp.ok) resp.text().finally(reject)
        else return resp.json()
      })
      .then(res => resolve(res as ImageMetadataResponse))
      .catch(reject)
  })
}

export interface ApiAtlasMapping {
  id: string
  width: number
  height: number
  x: number
  y: number
}

interface ApiAtlasResponseInternal {
  data: ArrayBuffer
  mapping: ApiAtlasMapping[]
}

export interface ApiAtlasResponse {
  atlas: ImageBitmap
  mapping: ApiAtlasMapping[]
}

export function getStaticAtlas(collection_id: string): Promise<ApiAtlasResponse[]> {
  return new Promise<ApiAtlasResponse[]>((resolve, reject) => {
    const request = new Request(`${BASE_URL}/${collection_id}/atlas`)
    const responseClock = measureTimeCallback('server response', 1)
    fetch(request)
      .then(resp => {
        if (!resp.ok) resp.text().then(reject).catch(reject)
        else return resp.arrayBuffer()
      })
      .then(buf => {
        responseClock()
        if (!buf) return
        return decode(new Uint8Array(buf)) as ApiAtlasResponseInternal[]
      })
      .then(async resp => {
        if (!resp) return

        const decodeClock = measureTimeCallback('texture decode', 1)

        return Promise.all(
          resp.map(async resp => {
            const data = await createImageBitmap(new Blob([resp.data]))
            return {
              atlas: data,
              mapping: resp.mapping,
            }
          }),
        )
          .then(data => resolve(data))
          .finally(decodeClock)
      })
      .catch(reject)
  })
}

export interface ApiBulkImageRequestEntry {
  id: string
  width: number
  height: number
}

export function getBulkImages(
  collection_id: string,
  req: ApiBulkImageRequestEntry[],
): Promise<(ImageBitmap | null)[]> {
  const request = new Request(`${BASE_URL}/${collection_id}/bulk`, {
    method: 'POST',
    body: JSON.stringify(req.map(r => [r.id, r.width, r.height])),
    headers: [['content-type', 'application/json']],
  })

  return new Promise((resolve, reject) => {
    const responseClock = measureTimeCallback('server response', 1)
    fetch(request)
      .then(resp => {
        if (!resp.ok) resp.text().then(reject).catch(reject)
        else return resp.arrayBuffer()
      })
      .then(async buf => {
        responseClock()
        if (!buf) return []

        const decodedMsg = decode(new Uint8Array(buf)) as (Uint8Array | null)[]
        const promises = decodedMsg.map(async b => {
          if (!b || b.length === 0) return null

          const blob = new Blob([b])
          if (!blob) return null

          try {
            return await createImageBitmap(blob)
          } catch (e) {
            console.error(e)
            return null
          }
        })

        return Promise.all(promises)
      })
      .then(resolve)
      .catch(reject)
  })
}

export interface ApiCollection {
  id: string
  name: string
}

export function getCollections(): Promise<ApiCollection[]> {
  const request = new Request(`${BASE_URL}/collections`)

  return new Promise((resolve, reject) => {
    fetch(request)
      .then(resp => {
        if (!resp.ok) resp.text().then(reject).catch(reject)
        else return resp.text()
      })
      .then(buf => buf && (JSON.parse(buf) as ApiCollection[]))
      .then(res => res && resolve(res))
      .catch(reject)
  })
}

export type ApiFilter = {}

export type ApiDistanceFunctionVariant =
  | { type: 'palette' }
  | { type: 'date_time' }
  | { type: 'palette_cos' }

export type ApiCompareFunctionVariant =
  | { type: 'signed_dist'; dist: ApiDistanceFunctionVariant }
  | { type: 'comparative_dist'; dist: ApiDistanceFunctionVariant; compared_to: string }

interface LayoutRequestTypeMap {
  grid_expansion: ApiLayoutGrid
  sort: ApiLayoutSort
  tsne: ApiLayoutPos
}

export type ApiLayoutRequest = ApiLayoutOptions & { filter?: ApiLayoutFilter }

export type ApiLayoutFilter = { has_metadata?: ('palette' | 'date_time')[]; limit?: number }

export type ApiLayoutOptions =
  | {
      type: 'grid_expansion'
      anchor?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
      grid_dist?: 'manhattan' | 'pseudo_pythegorean' | 'pythegorean'
      compare: ApiCompareFunctionVariant
    }
  | { type: 'sort'; compare: ApiCompareFunctionVariant }
  | { type: 'tsne'; dist: ApiDistanceFunctionVariant }

export interface ApiLayoutGrid {
  type: 'grid'
  data: Array<Array<string | null>>
}

export interface ApiLayoutSort {
  type: 'sort'
  data: Array<string>
}

export interface ApiLayoutPos {
  type: 'pos'
  data: Array<[string, number, number]>
}

export type ApiLayout = ApiLayoutGrid | ApiLayoutSort | ApiLayoutPos

export function getLayout<R extends ApiLayoutRequest>(
  collection_id: string,
  req: R,
): Promise<LayoutRequestTypeMap[R['type']]> {
  const request = new Request(`${BASE_URL}/${collection_id}/layout`, {
    method: 'POST',
    body: JSON.stringify(req),
    headers: [['content-type', 'application/json']],
  })

  return new Promise((resolve, reject) => {
    fetch(request)
      .then(resp => {
        if (!resp.ok) resp.text().finally(reject)
        else return resp.arrayBuffer()
      })
      .then(buf => {
        if (!buf) throw new Error('could not get buffer as arrayBuffer')
        return decode(new Uint8Array(buf)) as LayoutRequestTypeMap[R['type']]
      })
      .then(resolve)
      .catch(reject)
  })
}
