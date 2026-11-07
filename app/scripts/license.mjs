#!/usr/bin/env node
// أداة إصدار مفاتيح الترخيص. لصاحب البرنامج بس، وما بتنشحن مع البرنامج.
//
//   node scripts/license.mjs keygen <مجلد>
//       بيعمل زوج مفاتيح. الخاص بينحفظ بالمجلد، والعام بيطبعه عشان ينحط بـsrc/main/license-public-key.ts.
//       المفتاح الخاص هو اللي بيصدر التراخيص: انسخه احتياط، وما تحطه بالمشروع ولا بـgit أبدا.
//
//   node scripts/license.mjs issue --key <license-private.pem> --device NQ-XXXX-XXXX [--days 365 | --until 2027-12-31] [--plan full]
//       بيطبع مفتاح التفعيل للزبون. بدون --days أو --until: بدون انتهاء.
//
// الصيغة لازم تطابق src/main/license.ts (اختبار license.test.ts بيتأكد).

import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function base32Encode(bytes) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

const cmd = process.argv[2]

if (cmd === 'keygen') {
  const dir = process.argv[3] || fail('اكتب المجلد: node scripts/license.mjs keygen <مجلد>')
  const file = join(dir, 'license-private.pem')
  if (existsSync(file)) fail(`في مفتاح خاص موجود أصلا: ${file}\nما بنكتب فوقه، لأن كل التراخيص القديمة مربوطة فيه.`)
  mkdirSync(dir, { recursive: true })
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  console.log(`انحفظ المفتاح الخاص: ${file}`)
  console.log('انسخه احتياط بمكان آمن. بدونه ما بتقدر تصدر تراخيص للبرنامج المنشور.\n')
  console.log('المفتاح العام (حطه بـsrc/main/license-public-key.ts):\n')
  console.log(publicKey.export({ type: 'spki', format: 'pem' }))
} else if (cmd === 'issue') {
  const keyFile = arg('--key') || fail('--key <license-private.pem> مطلوب')
  const device = (arg('--device') || fail('--device NQ-XXXX-XXXX مطلوب')).trim().toUpperCase()
  if (!/^NQ-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(device)) fail(`كود الجهاز مش مزبوط: ${device}`)
  const plan = arg('--plan') || 'full'
  let expires = '-'
  if (arg('--until')) {
    expires = arg('--until')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) fail('--until بصيغة YYYY-MM-DD')
  } else if (arg('--days')) {
    const days = Number(arg('--days'))
    if (!Number.isInteger(days) || days <= 0) fail('--days رقم صحيح')
    expires = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  }
  const payload = new TextEncoder().encode(`NQ1|${device}|${expires}|${plan}`)
  const sig = sign(null, payload, createPrivateKey(readFileSync(keyFile)))
  const all = new Uint8Array(1 + payload.length + sig.length)
  all[0] = payload.length
  all.set(payload, 1)
  all.set(sig, 1 + payload.length)
  console.log(base32Encode(all).match(/.{1,5}/g).join('-'))
} else {
  fail('الأوامر: keygen <مجلد> | issue --key <ملف> --device NQ-XXXX-XXXX [--days N | --until YYYY-MM-DD] [--plan full]')
}
