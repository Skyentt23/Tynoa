import type { TynoaApi } from '../shared/api'

declare global {
  interface Window {
    tynoa: TynoaApi
  }
}
