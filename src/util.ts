import { useEffect, useRef, useState } from 'react'

export function measureTime<T>(label: string, threshhold: number, f: () => T): T {
  const start_time = performance.now()

  const v = f()

  const time = performance.now() - start_time
  if (time > threshhold) console.info(`${label} took ${time} ms`)

  return v
}

export function measureTimeCallback(label: string, threshhold: number): () => void {
  const start_time = performance.now()

  return () => {
    const time = performance.now() - start_time
    if (time > threshhold) console.info(`${label} took ${time} ms`)
  }
}

export function measureTimeAsync<T>(label: string, threshhold: number, f: Promise<T>): Promise<T> {
  const start_time = performance.now()

  return f.finally(() => {
    const time = performance.now() - start_time
    if (time > threshhold) console.info(`${label} took ${time} ms`)
  })
}

export function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg)
}

export interface QueryOptions {
  retryTime?: number
}

export interface QueryResult {
  status: QueryStatus
  error: unknown | undefined
}

export type QueryStatus = 'initial' | 'loading' | 'done' | 'waiting'

export function useQuery<T>(
  query: () => T | Promise<T>,
  initialValue: T,
  deps: React.DependencyList | undefined = [],
  opts: QueryOptions = {},
): [T, QueryResult] {
  const [data, setData] = useState<T>(initialValue)
  const [error, setError] = useState<unknown>()

  const status = useRef<QueryStatus>('initial')
  const runAgain = useRef<boolean>(false)

  const doQuery = () => {
    status.current = 'loading'
    Promise.resolve()
      .then(() => query())
      .then(data => {
        status.current = 'done'
        setData(data)

        if (runAgain.current) {
          runAgain.current = false
          doQuery()
        }
      })
      .catch(error => {
        const retryTime = opts?.retryTime || 0
        if (retryTime > 0) {
          setTimeout(() => doQuery(), retryTime)
        }

        status.current = 'waiting'
        setError(error)
      })
  }

  useEffect(() => {
    if (status.current === 'done') status.current = 'initial'
    else runAgain.current = true
  }, deps)

  useEffect(() => {
    if (status.current !== 'initial') return
    doQuery()
  })

  return [data, { status: status.current, error }]
}

export function useEq<T>(val: T, isEq: (prev: T, current: T) => boolean): T {
  const value = useRef(val)

  if (!isEq(value.current, val)) {
    value.current = val
  }

  return value.current
}
