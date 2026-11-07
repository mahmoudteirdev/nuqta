import type { NuqtaApi } from './index'

declare global {
  interface Window {
    nuqta?: NuqtaApi
  }
}
