import { ApiBulkImageRequestEntry } from './api'
import { Rectangle } from './types'

export interface JobTypeMap {
  apiBulkImageRequest: (
    collection_id: string,
    req: ApiBulkImageRequestEntry[],
  ) => {
    atlas_mapping: Map<string, Rectangle>
    texture_mapping: Map<string, ImageBitmap>
    buf_width: number
    buf_height: number
  }
}

export function executeJob<K extends keyof JobTypeMap>(
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WorkerType: any,
  transfer: Transferable[],
  ...args: Parameters<JobTypeMap[K]>
): Promise<ReturnType<JobTypeMap[K]>> {
  const worker: Worker = new WorkerType()
  return new Promise<ReturnType<JobTypeMap[K]>>((resolve, reject) => {
    worker.postMessage({ type, args }, transfer)
    worker.onerror = reject
    worker.onmessageerror = reject
    worker.onmessage = evt => resolve(evt.data)
  }).finally(() => worker.terminate())
}

export type Job<K extends keyof JobTypeMap> = {
  type: K
  args: Parameters<JobTypeMap[K]>
}
