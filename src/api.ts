import { decode as decodePng, DecodedPng } from 'fast-png'
import { decode as decodeMsgPack } from "@msgpack/msgpack"
import { measureTime, measureTimeCallback } from "./util"

export type ApiError = "FAILED"

const BASE_URL = "http://localhost:37371"

export interface ApiImage {
  id: string,
  name: string,
  width: number,
  height: number
}

export function getImageMetadata():  Promise<ApiImage[]> {
  return new Promise<ApiImage[]>((resolve, reject) => {
    fetch(`${BASE_URL}/images`)
      .then((resp) => {
        if (!resp.ok)
          resp.text().then(reject).catch(reject)
        else
          return resp.json()
      })
      .then((json) => resolve(json as ApiImage[]))
      .catch(reject)
  })
}

export interface ApiImageDataRequest {
  id?: string,
  id_list?: string[],
  limit?: number,
  
  icon_max_width: number,
  icon_max_height: number,
  atlas_max_area: number,
}

export interface ApiImageAtlasMapping {
  id: string,
  width: number,
  height: number,
  x: number,
  y: number
}

export interface ApiImageData {
  atlas: DecodedPng,
  mapping: ApiImageAtlasMapping[]
}

interface ApiImageDataResponse {
  data: ArrayBuffer,
  mapping: ApiImageAtlasMapping[] 
}

export function getImageData(req: ApiImageDataRequest): Promise<ApiImageData> {
  return new Promise<ApiImageData>((resolve, reject) => {
    const request = new Request(`${BASE_URL}/images/data`, {
      method: "POST",
      body: JSON.stringify(req),
      headers: [["content-type", "application/json"]]
    })
    
    const responseClock = measureTimeCallback("server response", 1)
    fetch(request)
      .then(resp => {
        if (!resp.ok)
          resp.text().then(reject).catch(reject)
        else
          return resp.arrayBuffer()
      })
      .then(buf => {
        responseClock()
        if (!buf)
          return
        return decodeMsgPack(buf) as ApiImageDataResponse
      })
      .then(resp => {
        if (!resp)
          return
      
        const data = measureTime("texture decode", 1, () => decodePng(resp.data, { checkCrc: true }) )
        resolve({
          atlas: data,
          mapping: resp.mapping
        })
      })
      .catch(reject)
  })
}
