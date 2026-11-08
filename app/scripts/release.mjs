#!/usr/bin/env node
// بيبني نسخة جديدة وبيوقّعها، وبيقولك شو ترفع. لصاحب البرنامج بس.
//
//   1. غيّر "version" بـpackage.json
//   2. npm run release
//   3. ارفع الملفات اللي بيطبعها على إصدار جديد بمستودع الإصدارات
//
//   --skip-build              وقّع اللي بـdist بدون بناء
//   --key <ملف>               الافتراضي ~/.nuqta-vendor/license-private.pem
//   --dist <مجلد>             الافتراضي dist
//   --public-key-file <ملف>   الافتراضي src/main/license-public-key.ts

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicFromPrivate, signUpdate } from './license-lib.mjs'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASES = 'https://github.com/mahmoudteirdev/nuqta-releases/releases/new'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

const keyFile = resolve(arg('--key') || join(homedir(), '.nuqta-vendor', 'license-private.pem'))
const dist = resolve(arg('--dist') || join(APP, 'dist'))
const publicFile = resolve(arg('--public-key-file') || join(APP, 'src/main/license-public-key.ts'))
if (!existsSync(keyFile)) fail(`ما لقيت مفتاح الإصدار: ${keyFile}`)
const privatePem = readFileSync(keyFile)

// البرنامج بيرفض أي تحديث مش موقّع بالمفتاح المطابق للي جواه.
const body = (pem) => String(pem).replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
const m = /`(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`/.exec(readFileSync(publicFile, 'utf8'))
if (!m || body(m[1]) !== body(publicFromPrivate(privatePem))) fail('مفتاح الإصدار مش مطابق للمفتاح جوا البرنامج، فالزباين رح يرفضوا التحديث. ما انعمل شي.')

if (!process.argv.includes('--skip-build')) execSync('npm run dist', { cwd: APP, stdio: 'inherit' })

const ymlPath = join(dist, 'latest.yml')
if (!existsSync(ymlPath)) fail(`ما لقيت ${ymlPath}. ابني النسخة أول.`)
const yml = readFileSync(ymlPath, 'utf8').replace(/^nuqtaSignature:.*\r?\n?/m, '').replace(/\s*$/, '\n')
const top = (key) => new RegExp(`^${key}: *'?([^'\\r\\n]+)'?`, 'm').exec(yml)?.[1]
const version = top('version')
const path = top('path')
const sha512 = top('sha512')
if (!version || !path || !sha512) fail('ملف latest.yml مش مكتمل.')

const exe = join(dist, path)
if (!existsSync(exe)) fail(`ما لقيت ملف التثبيت: ${exe}`)
const actual = createHash('sha512').update(readFileSync(exe)).digest('base64')
if (actual !== sha512) fail('ملف التثبيت مش مطابق للي بـlatest.yml. ابني النسخة من جديد.')

writeFileSync(ymlPath, `${yml}nuqtaSignature: ${signUpdate(privatePem, version, sha512)}\n`)

const files = [path, `${path}.blockmap`, 'latest.yml'].filter((f) => existsSync(join(dist, f)))
console.log(`\nالنسخة ${version} موقّعة. ارفع هالملفات من ${dist}:`)
for (const f of files) console.log(`  ${f}`)
console.log(`\nعلى إصدار جديد باسم v${version}:\n  ${RELEASES}?tag=v${version}&title=v${version}`)
console.log('\nأول ما تنشر الإصدار، البرامج المثبتة بتلاقيه لحالها.')
