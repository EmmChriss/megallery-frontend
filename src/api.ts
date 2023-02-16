import { decode as decodePng, DecodedPng } from 'fast-png'
import { decode as decodeMsgPack } from '@msgpack/msgpack'
import * as msgpackr from "msgpackr"
import { measureTime, measureTimeCallback } from './util'

export type ApiError = 'FAILED'

const BASE_URL = 'http://localhost:37371'

export interface ApiImage {
  id: string
  name: string
  width: number
  height: number
}

export function getImageMetadata(): Promise<ApiImage[]> {
  return new Promise<ApiImage[]>((resolve, reject) => {
    fetch(`${BASE_URL}/images`)
      .then(resp => {
        if (!resp.ok) resp.text().then(reject).catch(reject)
        else return resp.json()
      })
      .then(json => resolve(json as ApiImage[]))
      .catch(reject)
  })
}

export interface ApiImageDataRequest {
  id?: string
  id_list?: string[]
  limit?: number

  icon_max_width: number
  icon_max_height: number
  atlas_max_area: number
}

export interface ApiImageAtlasMapping {
  id: string
  width: number
  height: number
  x: number
  y: number
}

export interface ApiImageData {
  atlas: ImageBitmap
  mapping: ApiImageAtlasMapping[]
}

interface ApiImageDataResponse {
  data: ArrayBuffer
  mapping: ApiImageAtlasMapping[]
}

export function getImageData(req: ApiImageDataRequest): Promise<ApiImageData> {
  return new Promise<ApiImageData>((resolve, reject) => {
    const request = new Request(`${BASE_URL}/images/data`, {
      method: 'POST',
      body: JSON.stringify(req),
      headers: [['content-type', 'application/json']],
    })

    const responseClock = measureTimeCallback('server response', 1)
    fetch(request)
      .then(resp => {
        if (!resp.ok) resp.text().then(reject).catch(reject)
        else return resp.arrayBuffer()
      })
      .then(buf => {
        responseClock()
        if (!buf) return
        return decodeMsgPack(buf) as ApiImageDataResponse
      })
      .then(async resp => {
        if (!resp) return

        const decodeClock = measureTimeCallback('texture decode', 1)
        const data = await createImageBitmap(new Blob([resp.data]), {
          imageOrientation: 'flipY',
        })
        decodeClock()

        resolve({
          atlas: data,
          mapping: resp.mapping,
        })
      })
      .catch(reject)
  })
}

export interface ApiImageDataRequestV2 {
  id: string
  max_width: number
  max_height: number
}

export function getImageDataByIds(req: ApiImageDataRequestV2[]): Promise<(ImageBitmap | undefined)[]> {
  const request = new Request(`${BASE_URL}/images/data_new`, {
    method: 'POST',
    body: JSON.stringify(req),
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
        if (!buf)
          throw new Error()

        const decodedResponse = measureTime("decode response", 1, () => decodeMsgPack(buf)) as (Uint8Array | null)[]

        return await Promise.all(decodedResponse
          .map(async buf => {
            if (!buf)
              return

            console.log("imaging")
            return await createImageBitmap(new Blob([buf]))
          })
        )
      })
      .then(resolve)
      .catch(reject)
  })
}
