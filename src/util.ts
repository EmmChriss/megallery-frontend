import { useEffect, useRef, useState } from "react"

export function measureTime<T>(label: string, threshhold: number, f: () => T): T {
  const start_time = performance.now()
  
  const v = f()

  const time = performance.now() - start_time
  if (time > threshhold)
    console.info(`${label} took ${time} ms`)

  return v
}

export function measureTimeCallback(label: string, threshhold: number): () => void {
  const start_time = performance.now()

  return () => {
    const time = performance.now() - start_time
    if (time > threshhold)
      console.info(`${label} took ${time} ms`)
  }
}

export function assert(condition: boolean, msg?: string) {
  if (!condition)
    throw new Error(msg)
}

export interface QueryOptions {
  retryTime?: number,
}

export interface QueryResult {
  status: QueryStatus
  error: any | undefined
}

export type QueryStatus = "initial" | "loading" | "done" | "waiting"

export function useQuery<T>(query: PromiseLike<T>, opts: QueryOptions = {}): [T | undefined, QueryResult] {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<any>()

  const status = useRef<QueryStatus>("initial")
  const doQuery = () => {
    status.current = "loading"
    Promise.resolve()
      .then(() => query)
      .then(data => {
        status.current = "done"
        setData(data)
      })
      .catch(error => {
        const retryTime = opts?.retryTime || 0
        if (retryTime > 0) {
          setTimeout(() => doQuery(), retryTime)
        }

        status.current = "waiting"
        setError(error)
      })
  }
  
  useEffect(() => {
    if (status.current !== "initial")
      return
    doQuery()
  })

  return [data, { status: status.current, error }]
}
