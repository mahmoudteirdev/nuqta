import { createServer, type Server } from 'node:http'
import * as http from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-ignore
import { signUpdate, publicFromPrivate } from '../../scripts/license-lib.mjs'
import { checkUpdateSignature, UpdateService, type UpdaterLike } from './updates'

const require = createRequire(import.meta.url)
const { NsisUpdater } = require('electron-updater')
const { HttpExecutor, configureRequestUrl, configureRequestOptions } = require('builder-util-runtime')

class NodeHttpExecutor extends HttpExecutor<http.ClientRequest> {
  createRequest(options: any, callback: any) {
    return http.request(options, callback)
  }
  async download(url: any, destination: string, options: any) {
    return await options.cancellationToken.createPromise((resolve: any, reject: any, onCancel: any) => {
      const requestOptions: any = {
        headers: options.headers || undefined,
        redirect: 'manual'
      }
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(requestOptions, {
        destination,
        options,
        onCancel,
        callback: (error: any) => {
          if (error == null) resolve(destination)
          else reject(error)
        },
        responseHandler: null
      })
    })
  }
}

describe('e2e real update flow with electron-updater NsisUpdater', () => {
  let server: Server
  let testDir: string
  let serverDir: string
  let cacheDir: string
  let userDir: string
  let exeName: string
  let exeContent: Buffer
  let sha512: string
  let validSig: string
  let currentSig: string
  let publicPem: string
  const PORT = 4892

  beforeAll(async () => {
    // مفتاح المالك
    const keyFile = join(homedir(), '.nuqta-vendor', 'license-private.pem')
    const privatePem = readFileSync(keyFile)
    publicPem = publicFromPrivate(privatePem)

    testDir = join(tmpdir(), 'nuqta-update-e2e-' + Date.now())
    serverDir = join(testDir, 'server')
    cacheDir = join(testDir, 'cache')
    userDir = join(testDir, 'user')
    mkdirSync(serverDir, { recursive: true })
    mkdirSync(cacheDir, { recursive: true })
    mkdirSync(userDir, { recursive: true })

    exeName = 'Nuqta-Setup-0.1.1.exe'
    const exePath = join(serverDir, exeName)
    exeContent = Buffer.from('FAKE-INSTALLER-BINARY-NUQTA-0.1.1-' + 'X'.repeat(1024 * 64))
    writeFileSync(exePath, exeContent)
    sha512 = createHash('sha512').update(exeContent).digest('base64')

    validSig = signUpdate(privatePem, '0.1.1', sha512)
    currentSig = 'bm9wZQ==' // start with bad signature

    server = createServer((req, res) => {
      const url = req.url?.split('?')[0]
      if (url === '/latest.yml') {
        const yml = `version: 0.1.1
files:
  - url: ${exeName}
    sha512: ${sha512}
    size: ${exeContent.length}
path: ${exeName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
nuqtaSignature: ${currentSig}
`
        res.writeHead(200, { 'Content-Type': 'text/yaml' })
        res.end(yml)
        return
      }
      if (url === `/${exeName}`) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': exeContent.length
        })
        res.end(exeContent)
        return
      }
      res.writeHead(404)
      res.end('Not found')
    })

    const appUpdateConfig = join(testDir, 'app-update.yml')
    writeFileSync(appUpdateConfig, 'provider: generic\n')
    await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()))
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  const createAppAdapter = () => ({
    version: '0.1.0',
    name: 'nuqta',
    isPackaged: true,
    appUpdateConfigPath: join(testDir, 'app-update.yml'),
    userDataPath: userDir,
    baseCachePath: cacheDir,
    whenReady: () => Promise.resolve()
  })

  const createTestUpdater = () => {
    let quitCalled = false
    const nodeExec = new NodeHttpExecutor()
    class TestNsisUpdater extends NsisUpdater {
      constructor() {
        super({ provider: 'generic', url: `http://127.0.0.1:${PORT}` }, createAppAdapter())
        this.httpExecutor = nodeExec
        this.autoDownload = true
        this.autoInstallOnAppQuit = false
      }
      createProviderRuntimeOptions() {
        return {
          isUseMultipleRangeRequest: true,
          platform: process.platform,
          executor: nodeExec
        }
      }
      quitAndInstall() {
        quitCalled = true
      }
    }
    return { updater: new TestNsisUpdater(), getQuitCalled: () => quitCalled }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  it('rejects an update when nuqtaSignature does not match the binary', async () => {
    currentSig = 'bm9wZQ=='
    const { updater, getQuitCalled } = createTestUpdater()
    const service = new UpdateService(updater as unknown as UpdaterLike, '0.1.0', publicPem)

    await service.check()

    let attempts = 0
    while ((service.view().state === 'downloading' || service.view().state === 'checking') && attempts++ < 50) {
      await sleep(100)
    }

    const view = service.view()
    expect(view.state).toBe('failed')
    expect(view.reason).toBe('signature')
    expect(service.install()).toBe(false)
    expect(getQuitCalled()).toBe(false)
  })

  it('accepts and marks ready when nuqtaSignature matches the downloaded binary and owner key', async () => {
    currentSig = validSig
    const { updater, getQuitCalled } = createTestUpdater()
    const service = new UpdateService(updater as unknown as UpdaterLike, '0.1.0', publicPem)

    await service.check()

    let attempts = 0
    while ((service.view().state === 'downloading' || service.view().state === 'checking') && attempts++ < 50) {
      await sleep(100)
    }

    const view = service.view()
    expect(view.state).toBe('ready')
    expect(view.version).toBe('0.1.1')
    expect(view.percent).toBe(100)
    expect(view.reason).toBeNull()

    const ok = service.install()
    expect(ok).toBe(true)
    expect(getQuitCalled()).toBe(true)
  })
})
