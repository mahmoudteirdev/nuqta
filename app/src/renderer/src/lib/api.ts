import type { Backend, BackendMethod } from '@shared/api'

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never }

/** api.home() ← Backend.home() بالعملية الرئيسية. */
export const api = new Proxy({} as Async<Backend>, {
  get: (_t, method: string) => (...args: unknown[]) => {
    if (!window.nuqta) return Promise.reject(new Error('backend not available (open the app in Electron)'))
    return (window.nuqta.call as (m: BackendMethod, ...a: unknown[]) => Promise<unknown>)(method as BackendMethod, ...args)
  }
})
