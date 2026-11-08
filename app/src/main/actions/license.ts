// الترخيص من جهة البرنامج: الوضع الحالي، والتفعيل بمفتاح.

import type { Backend, LicenseInfo } from '@shared/api'
import type { Store } from '../db/store'
import { normalizePin, type AuthError } from '../auth'
import { checkKey, checkResetKey, licenseState, newResetRequest } from '../license'

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

const REQUEST = 'pin_reset_request'

/** نسيان رمز المدير: الجهاز بيعطي رمز طلب، والدعم بيوقّع مفتاح لهالطلب بس، وبعد الاستخدام الطلب بيتغير. */
export function pinResetActions(ctx: {
  store: () => Store | null
  device: string
  publicKeyPem: string
  resetOwnerPin: (pin: string) => AuthError | null
  now?: () => string
}): Pick<Backend, 'pinResetRequest' | 'pinResetApply'> {
  const now = ctx.now ?? (() => new Date().toISOString())
  return {
    pinResetRequest: () => {
      const store = ctx.store()
      if (!store) throw new Error('database is not open')
      let code = store.getSetting(REQUEST)
      if (!code) {
        code = newResetRequest()
        store.setSetting(REQUEST, code)
      }
      return { deviceCode: ctx.device, requestCode: code }
    },
    pinResetApply: (key, pin) => {
      const store = ctx.store()
      if (!store) return { ok: false, error: { code: 'backup_no_db' } }
      if (!normalizePin(pin)) return { ok: false, error: { code: 'auth_pin_format' } }
      const request = store.getSetting(REQUEST)
      if (!request) return { ok: false, error: { code: 'reset_wrong_request' } }
      const r = checkResetKey(key, ctx.device, request, ctx.publicKeyPem, now().slice(0, 10))
      if (!r.ok) return { ok: false, error: { code: `reset_${r.reason}` } }
      const e = ctx.resetOwnerPin(pin)
      if (e) return { ok: false, error: { code: `auth_${e}` } }
      store.setSetting(REQUEST, '')
      return { ok: true, value: undefined }
    }
  }
}
