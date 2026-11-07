import { useEffect, useState } from 'react'
import { useStore } from './store'

export type Loaded<T> = { state: 'loading' } | { state: 'error'; error: Error } | { state: 'ready'; data: T }

/** بيقرأ من العملية الرئيسية، وبيعيد القراءة لما شي يتغير (revision) أو deps. */
export function useApi<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Loaded<T> & { retry: () => void } {
  const { state } = useStore()
  const [res, setRes] = useState<Loaded<T>>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (data) => live && setRes({ state: 'ready', data }),
      (error: unknown) => live && setRes({ state: 'error', error: error instanceof Error ? error : new Error(String(error)) })
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.revision, attempt, ...deps])
  return { ...res, retry: () => { setRes({ state: 'loading' }); setAttempt((n) => n + 1) } }
}
