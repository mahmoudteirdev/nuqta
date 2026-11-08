import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { allowed } from '@shared/permissions'
import { checkUpdateSignature, signedUpdateText, UpdateService, type UpdaterLike } from './updates'

const kp = generateKeyPairSync('ed25519')
const pub = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString()
let dir: string
let file: string
let sha: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'nuqta-upd-'))
  file = join(dir, 'Nuqta-Setup-0.2.0.exe')
  writeFileSync(file, 'the installer bytes')
  sha = createHash('sha512').update(readFileSync(file)).digest('base64')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const signFor = (version: string, hash = sha, key = kp.privateKey) => sign(null, Buffer.from(signedUpdateText(version, hash)), key).toString('base64')

class FakeUpdater implements UpdaterLike {
  autoDownload = false
  autoInstallOnAppQuit = true
  disableDifferentialDownload = false
  logger: unknown = {}
  installed: [boolean | undefined, boolean | undefined] | null = null
  checks = 0
  onCheck: () => void | Promise<void> = () => {}
  readonly listeners = new Map<string, (a: never) => void>()
  on(event: string, listener: (a: never) => void): this {
    this.listeners.set(event, listener)
    return this
  }
  emit(event: string, arg?: unknown): void {
    (this.listeners.get(event) as (a: unknown) => void)(arg)
  }
  async checkForUpdates(): Promise<unknown> {
    this.checks++
    await this.onCheck()
    return null
  }
  quitAndInstall(a?: boolean, b?: boolean): void {
    this.installed = [a, b]
  }
}

const settle = () => new Promise((r) => setTimeout(r, 30))

describe('update signature', () => {
  it('accepts the file that was signed, for that version', async () => {
    expect(await checkUpdateSignature(file, '0.2.0', signFor('0.2.0'), pub)).toBe(true)
  })

  it('refuses a missing, forged, or wrong-version signature, or a changed file', async () => {
    expect(await checkUpdateSignature(file, '0.2.0', undefined, pub)).toBe(false)
    expect(await checkUpdateSignature(file, '0.2.0', '', pub)).toBe(false)
    expect(await checkUpdateSignature(file, '0.2.0', 'bm90IGEgc2lnbmF0dXJl', pub)).toBe(false)
    expect(await checkUpdateSignature(file, '0.2.0', signFor('0.2.0', sha, generateKeyPairSync('ed25519').privateKey), pub)).toBe(false)
    expect(await checkUpdateSignature(file, '0.3.0', signFor('0.2.0'), pub)).toBe(false)
    const other = join(dir, 'changed.exe')
    writeFileSync(other, 'a different installer')
    expect(await checkUpdateSignature(other, '0.2.0', signFor('0.2.0'), pub)).toBe(false)
    expect(await checkUpdateSignature(join(dir, 'missing.exe'), '0.2.0', signFor('0.2.0'), pub)).toBe(false)
  })
})

describe('update flow', () => {
  let u: FakeUpdater
  let s: UpdateService
  beforeEach(() => {
    u = new FakeUpdater()
    s = new UpdateService(u, '0.1.0', pub, () => '2026-11-08T10:00:00.000Z')
  })

  it('downloads by itself but never installs on its own', () => {
    expect(u.autoDownload).toBe(true)
    expect(u.autoInstallOnAppQuit).toBe(false)
    expect(s.view()).toMatchObject({ current: '0.1.0', state: 'idle', checkedAt: null })
  })

  it('goes from checking to downloading to ready, then installs only when asked', async () => {
    u.onCheck = () => {
      expect(s.view().state).toBe('checking')
      u.emit('update-available', { version: '0.2.0' })
    }
    await s.check()
    expect(s.view()).toMatchObject({ state: 'downloading', version: '0.2.0', percent: 0 })
    u.emit('download-progress', { percent: 41.7 })
    expect(s.view().percent).toBe(42)
    expect(s.install()).toBe(false)
    expect(u.installed).toBeNull()
    u.emit('update-downloaded', { version: '0.2.0', downloadedFile: file, nuqtaSignature: signFor('0.2.0') })
    await settle()
    expect(s.view()).toMatchObject({ state: 'ready', version: '0.2.0', percent: 100, reason: null })
    expect(u.installed).toBeNull()
    expect(s.install()).toBe(true)
    expect(u.installed).toEqual([true, true])
  })

  it('refuses an update with a bad signature and will not install it', async () => {
    u.emit('update-downloaded', { version: '0.2.0', downloadedFile: file, nuqtaSignature: 'bm9wZQ==' })
    await settle()
    expect(s.view()).toMatchObject({ state: 'failed', reason: 'signature', version: null })
    expect(s.install()).toBe(false)
    expect(u.installed).toBeNull()
  })

  it('refuses an update with no signature at all', async () => {
    u.emit('update-downloaded', { version: '0.2.0', downloadedFile: file })
    await settle()
    expect(s.view().reason).toBe('signature')
    expect(s.install()).toBe(false)
  })

  it('stays calm with no internet, and a later check can still succeed', async () => {
    u.onCheck = () => { throw new Error('net::ERR_INTERNET_DISCONNECTED') }
    await s.check()
    expect(s.view()).toMatchObject({ state: 'failed', reason: 'network' })
    u.onCheck = () => { u.emit('update-not-available') }
    await s.check()
    expect(s.view()).toMatchObject({ state: 'idle', reason: null, checkedAt: '2026-11-08T10:00:00.000Z' })
  })

  it('a ready update survives a later network error and is not checked again', async () => {
    u.emit('update-downloaded', { version: '0.2.0', downloadedFile: file, nuqtaSignature: signFor('0.2.0') })
    await settle()
    u.emit('error', new Error('offline'))
    expect(s.view().state).toBe('ready')
    await s.check()
    expect(u.checks).toBe(0)
    expect(s.install()).toBe(true)
  })

  it('only one check runs at a time', async () => {
    let release = () => {}
    u.onCheck = () => new Promise<void>((r) => { release = r })
    const first = s.check()
    await s.check()
    expect(u.checks).toBe(1)
    release()
    await first
  })
})

describe('who can update', () => {
  it('only the owner checks and installs', () => {
    const ctx = (role: 'owner' | 'technician' | null) => ({ role, setupOpen: false, dbBroken: false, dev: false })
    for (const m of ['checkForUpdate', 'installUpdate'] as const) {
      expect(allowed(m, ctx('owner'))).toBe(true)
      expect(allowed(m, ctx('technician'))).toBe(false)
      expect(allowed(m, ctx(null))).toBe(false)
    }
  })
})

describe('the release command', () => {
  const script = resolve(__dirname, '../../scripts/release.mjs')
  let rel: string
  let key: string
  let publicFile: string
  const yml = (hash: string) => `version: 0.2.0\nfiles:\n  - url: Nuqta-Setup-0.2.0.exe\n    sha512: ${hash}\n    size: 19\npath: Nuqta-Setup-0.2.0.exe\nsha512: ${hash}\nreleaseDate: '2026-11-08T10:00:00.000Z'\n`
  const run = (...extra: string[]) => execFileSync(process.execPath, [script, '--skip-build', '--dist', rel, '--key', key, '--public-key-file', publicFile, ...extra], { encoding: 'utf8', stdio: 'pipe' })

  beforeAll(() => {
    rel = join(dir, 'rel')
    mkdirSync(rel)
    copyFileSync(file, join(rel, 'Nuqta-Setup-0.2.0.exe'))
    key = join(dir, 'k.pem')
    writeFileSync(key, kp.privateKey.export({ type: 'pkcs8', format: 'pem' }))
    publicFile = join(dir, 'pub.ts')
    writeFileSync(publicFile, `export const LICENSE_PUBLIC_KEY = \`${pub.trim()}\`\n`)
  })

  it('adds a signature the app accepts, and signing again keeps one signature', async () => {
    writeFileSync(join(rel, 'latest.yml'), yml(sha))
    run()
    run()
    const text = readFileSync(join(rel, 'latest.yml'), 'utf8')
    const found = [...text.matchAll(/^nuqtaSignature: (.+)$/gm)]
    expect(found).toHaveLength(1)
    expect(await checkUpdateSignature(file, '0.2.0', found[0]![1], pub)).toBe(true)
  })

  it('refuses when the installer does not match latest.yml', () => {
    writeFileSync(join(rel, 'latest.yml'), yml('d3Jvbmc='))
    expect(() => run()).toThrow()
  })

  it('refuses a key the app would reject, so no release goes out unusable', () => {
    writeFileSync(join(rel, 'latest.yml'), yml(sha))
    const other = join(dir, 'other.pem')
    writeFileSync(other, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }))
    expect(() => execFileSync(process.execPath, [script, '--skip-build', '--dist', rel, '--key', other, '--public-key-file', publicFile], { stdio: 'pipe' })).toThrow()
    expect(readFileSync(join(rel, 'latest.yml'), 'utf8')).not.toContain('nuqtaSignature')
  })
})
