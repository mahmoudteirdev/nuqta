// الترخيص من جهة البرنامج: الوضع الحالي، والتفعيل بمفتاح.

import type { Backend, LicenseInfo } from '@shared/api'
import type { Store } from '../db/store'
import { checkKey, licenseState } from '../license'

export function licenseActions(ctx: {
  store: () => Store | null
  device: string
  installedAt: string
  publicKeyPem: string
  now?: () => string
}): Pick<Backend, 'license' | 'activateLicense'> & { info: () => LicenseInfo } {
  const now = ctx.now ?? (() => new Date().toISOString())
  const info = (): LicenseInfo => {
    const s = licenseState({ key: ctx.store()?.getSetting('license_key') ?? null, device: ctx.device, publicKeyPem: ctx.publicKeyPem, installedAt: ctx.installedAt, now: now() })
    return { ...s, deviceCode: ctx.device } as LicenseInfo
  }
  return {
    info,
    license: info,
    activateLicense: (key) => {
      const store = ctx.store()
      if (!store) return { ok: false, error: { code: 'backup_no_db' } }
      if (!key.trim()) return { ok: false, error: { code: 'license_empty' } }
      const r = checkKey(key, ctx.device, ctx.publicKeyPem, now().slice(0, 10))
      if (!r.ok) return { ok: false, error: { code: `license_${r.reason}` } }
      store.setSetting('license_key', key.trim().toUpperCase())
      return { ok: true, value: info() }
    }
  }
}
