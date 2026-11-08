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
//   node scripts/license.mjs reset --key <license-private.pem> --device NQ-XXXX-XXXX --request XXXXXXXX
//       صاحب الشبكة نسي رمزه: بيطبع مفتاح استرجاع لمرة وحدة، صالح 3 أيام.
//
// للاستخدام اليومي في أداة أسهل بصفحة وسجل زباين: npm run license:admin
// الصيغة لازم تطابق src/main/license.ts (اختبار license.test.ts بيتأكد).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addDays, generateKeys, issueKey, issueResetKey, normalizeDevice, normalizeRequest } from './license-lib.mjs'

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
  const { privatePem, publicPem } = generateKeys()
  writeFileSync(file, privatePem, { mode: 0o600 })
  console.log(`انحفظ المفتاح الخاص: ${file}`)
  console.log('انسخه احتياط بمكان آمن. بدونه ما بتقدر تصدر تراخيص للبرنامج المنشور.\n')
  console.log('المفتاح العام (حطه بـsrc/main/license-public-key.ts):\n')
  console.log(publicPem)
} else if (cmd === 'issue') {
  const keyFile = arg('--key') || fail('--key <license-private.pem> مطلوب')
  const given = arg('--device') || fail('--device NQ-XXXX-XXXX مطلوب')
  const device = normalizeDevice(given) || fail(`كود الجهاز مش مزبوط: ${given}`)
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
  console.log(issueKey(readFileSync(keyFile), { device, expires: expires === '-' ? null : expires, plan }))
} else if (cmd === 'reset') {
  const keyFile = arg('--key') || fail('--key <license-private.pem> مطلوب')
  const given = arg('--device') || fail('--device NQ-XXXX-XXXX مطلوب')
  const device = normalizeDevice(given) || fail(`كود الجهاز مش مزبوط: ${given}`)
  const request = normalizeRequest(arg('--request')) || fail('--request: رمز الطلب من 8 أحرف، من شاشة «نسيت الرمز» عند الزبون')
  console.log(issueResetKey(readFileSync(keyFile), { device, request, expires: addDays(new Date(), 3) }))
} else {
  fail('الأوامر: keygen <مجلد> | issue --key <ملف> --device NQ-XXXX-XXXX [--days N | --until YYYY-MM-DD] [--plan full] | reset --key <ملف> --device NQ-XXXX-XXXX --request XXXXXXXX')
}
