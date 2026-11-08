// كود إصدار التراخيص المشترك بين سطر الأوامر (license.mjs) وأداة الإصدار (license-admin.mjs).
// الصيغة لازم تطابق src/main/license.ts (اختبارات license.test.ts وlicense-admin.test.ts بيتأكدوا).

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** نفس أحرف كود الجهاز بالبرنامج: بدون 0 O 1 I L. */
const DEVICE_RE = /^NQ-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/

function base32Encode(bytes) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

/** بيقبل أحرف صغيرة ومسافات، ونسخ الكود بدون شرطات. كود مش مزبوط بيرجع null. */
export function normalizeDevice(text) {
  const s = String(text ?? '').toUpperCase().replace(/[\s‎‏‪-‮⁦-⁩-]/g, '')
  const code = `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}`
  return DEVICE_RE.test(code) ? code : null
}

export function issueKey(privatePem, { device, expires = null, plan = 'full' }) {
  const payload = new TextEncoder().encode(`NQ1|${device}|${expires ?? '-'}|${plan}`)
  const sig = sign(null, payload, createPrivateKey(privatePem))
  const all = new Uint8Array(1 + payload.length + sig.length)
  all[0] = payload.length
  all.set(payload, 1)
  all.set(sig, 1 + payload.length)
  return base32Encode(all).match(/.{1,5}/g).join('-')
}

export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' })
  }
}

export function publicFromPrivate(privatePem) {
  return createPublicKey(createPrivateKey(privatePem)).export({ type: 'spki', format: 'pem' })
}

const pad = (n) => String(n).padStart(2, '0')
export const dateText = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** تاريخ بعد عدد شهور. 31 آب + 6 شهور = آخر شباط، مش أول آذار. */
export function addMonths(from, months) {
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(from.getDate(), last))
  return dateText(d)
}

export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(y, m - 1, d)
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d
}
