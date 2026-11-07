// الترخيص: كود جهاز + مفتاح موقّع (Ed25519).
// البرنامج فيه المفتاح العام بس، فبيقدر يتأكد من المفتاح بدون نت، بس ما بيقدر حدا يصنع مفتاح من البرنامج.
// المفتاح مربوط بكود الجهاز، فما بيشتغل على جهاز ثاني.
//
// صيغة المفتاح: Base32 (Crockford) لـ: payload بطوله (بايت) + payload + توقيع 64 بايت.
// payload نص UTF-8: «NQ1|<كود الجهاز>|<الانتهاء YYYY-MM-DD أو ->|<الخطة>».

import { createHash, createPublicKey, verify } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** كود الجهاز من 31 رمز زي الكروت: بدون 0 O 1 I L. */
const DEVICE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const TRIAL_DAYS = 14

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

/** بيقبل أحرف صغيرة ومسافات وشرطات، وO بدل 0 وI/L بدل 1 (Crockford). */
export function base32Decode(text: string): Uint8Array | null {
  const s = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of s) {
    const v = B32.indexOf(ch)
    if (v < 0) return null
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

/** NQ-XXXX-XXXX من معرّف الجهاز. نفس الجهاز بيعطي نفس الكود دايما. */
export function deviceCode(machineId: string): string {
  const h = createHash('sha256').update('nuqta-device:' + machineId.trim().toLowerCase()).digest()
  let code = ''
  for (let i = 0; code.length < 8; i++) code += DEVICE_ALPHABET[h[i]! % DEVICE_ALPHABET.length]
  return `NQ-${code.slice(0, 4)}-${code.slice(4)}`
}

export interface LicenseClaims {
  deviceCode: string
  /** YYYY-MM-DD، أو null بدون انتهاء. */
  expires: string | null
  plan: string
}

export function encodePayload(c: LicenseClaims): Uint8Array {
  return new TextEncoder().encode(`NQ1|${c.deviceCode}|${c.expires ?? '-'}|${c.plan}`)
}

/** المفتاح النهائي: طول + payload + توقيع، بمجموعات من 5 عشان ينقرا وينسخ. */
export function formatKey(payload: Uint8Array, signature: Uint8Array): string {
  const all = new Uint8Array(1 + payload.length + signature.length)
  all[0] = payload.length
  all.set(payload, 1)
  all.set(signature, 1 + payload.length)
  return base32Encode(all).match(/.{1,5}/g)!.join('-')
}

export type KeyCheck =
  | { ok: true; claims: LicenseClaims }
  | { ok: false; reason: 'invalid' | 'other_device' | 'expired' }

export function checkKey(key: string, myDevice: string, publicKeyPem: string, today: string): KeyCheck {
  const bytes = base32Decode(key)
  if (!bytes || bytes.length < 2) return { ok: false, reason: 'invalid' }
  const n = bytes[0]!
  if (bytes.length !== 1 + n + 64) return { ok: false, reason: 'invalid' }
  const payload = bytes.subarray(1, 1 + n)
  const sig = bytes.subarray(1 + n)
  let good = false
  try {
    good = verify(null, payload, createPublicKey(publicKeyPem), sig)
  } catch {
    good = false
  }
  if (!good) return { ok: false, reason: 'invalid' }
  const parts = new TextDecoder().decode(payload).split('|')
  if (parts.length !== 4 || parts[0] !== 'NQ1') return { ok: false, reason: 'invalid' }
  const claims: LicenseClaims = { deviceCode: parts[1]!, expires: parts[2] === '-' ? null : parts[2]!, plan: parts[3]! }
  if (claims.deviceCode !== myDevice) return { ok: false, reason: 'other_device' }
  if (claims.expires && claims.expires < today) return { ok: false, reason: 'expired' }
  return { ok: true, claims }
}

export type LicenseState =
  | { state: 'licensed'; plan: string; expires: string | null }
  | { state: 'trial'; daysLeft: number }
  | { state: 'expired' }

/**
 * الوضع الحالي. installedAt: أول تشغيل على الجهاز، من ملف برا قاعدة البيانات عشان استرجاع نسخة ما يصفّر التجربة.
 * المفتاح المحفوظ بينفحص كل مرة: مفتاح من جهاز ثاني (نسخة منقولة) ما بيشتغل.
 */
export function licenseState(o: { key: string | null; device: string; publicKeyPem: string; installedAt: string; now: string }): LicenseState {
  const today = o.now.slice(0, 10)
  if (o.key) {
    const r = checkKey(o.key, o.device, o.publicKeyPem, today)
    if (r.ok) return { state: 'licensed', plan: r.claims.plan, expires: r.claims.expires }
  }
  const used = Math.floor((Date.parse(o.now) - Date.parse(o.installedAt)) / 86_400_000)
  const left = TRIAL_DAYS - used
  return left > 0 ? { state: 'trial', daysLeft: left } : { state: 'expired' }
}
