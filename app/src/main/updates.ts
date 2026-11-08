// التحديث التلقائي. بينزل بالخلفية، وما بينثبت إلا لما صاحب الشبكة يضغط.
// البرنامج مش موقّع بشهادة، فكل نسخة بتنوقّع بمفتاح الإصدار: لو حدا وصل لمكان الملفات
// ما بيقدر يوصّل تحديث للزباين بدون المفتاح الخاص.

import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { UpdateView } from '@shared/api'

export const signedUpdateText = (version: string, sha512: string): string => `NQU1|${version}|${sha512}`

export function fileSha512(path: string): Promise<string> {
  return new Promise((ok, no) => {
    const h = createHash('sha512')
    createReadStream(path).on('data', (c) => h.update(c)).on('error', no).on('end', () => ok(h.digest('base64')))
  })
}

/** الملف النازل نفسه لازم يطابق التوقيع، مش بس اللي مكتوب بملف الإصدار. */
export async function checkUpdateSignature(path: string, version: string, signature: unknown, publicKeyPem: string): Promise<boolean> {
  if (typeof signature !== 'string' || !signature) return false
  try {
    const text = signedUpdateText(version, await fileSha512(path))
    return verify(null, Buffer.from(text), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

/** الجزء اللي بنستخدمه من electron-updater، عشان ينفحص بدون Electron. */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  disableDifferentialDownload: boolean
  logger: unknown
  on(event: string, listener: (arg: never) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface DownloadedInfo {
  version: string
  downloadedFile: string
  nuqtaSignature?: unknown
}

export class UpdateService {
  #view: UpdateView
  #busy = false

  constructor(
    private readonly updater: UpdaterLike,
    current: string,
    private readonly publicKeyPem: string,
    private readonly now: () => string = () => new Date().toISOString()
  ) {
    this.#view = { current, state: 'idle', version: null, percent: 0, reason: null, checkedAt: null }
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = false
    // الملفات بمكان ثابت «آخر إصدار»، فالمقارنة مع النسخة القديمة ما إلها مصدر.
    updater.disableDifferentialDownload = true
    updater.logger = null
    updater.on('checking-for-update', () => this.#set({ state: 'checking', reason: null }))
    updater.on('update-not-available', () => this.#finished({ state: 'idle', version: null }))
    updater.on('update-available', (i: { version: string }) => this.#set({ state: 'downloading', version: i.version, percent: 0, reason: null }))
    updater.on('download-progress', (p: { percent: number }) => this.#set({ state: 'downloading', percent: Math.round(p.percent) }))
    updater.on('update-downloaded', (i: DownloadedInfo) => void this.#downloaded(i))
    updater.on('error', () => this.#finished({ state: 'failed', reason: 'network' }))
  }

  view(): UpdateView {
    return { ...this.#view }
  }

  #set(p: Partial<UpdateView>): void {
    this.#view = { ...this.#view, ...p }
  }

  #finished(p: Partial<UpdateView>): void {
    this.#busy = false
    // نسخة جاهزة ما بتضيع إذا فحص لاحق فشل بسبب النت.
    if (this.#view.state === 'ready' && p.state === 'failed') return
    this.#set({ ...p, checkedAt: this.now() })
  }

  async #downloaded(i: DownloadedInfo): Promise<void> {
    const good = await checkUpdateSignature(i.downloadedFile, i.version, i.nuqtaSignature, this.publicKeyPem)
    if (good) this.#finished({ state: 'ready', version: i.version, percent: 100, reason: null })
    else this.#finished({ state: 'failed', version: null, percent: 0, reason: 'signature' })
  }

  /** فحص واحد بكل مرة. نسخة جاهزة ما بتتفحص من جديد. */
  async check(): Promise<UpdateView> {
    if (this.#busy || this.#view.state === 'ready') return this.view()
    this.#busy = true
    this.#set({ state: 'checking', reason: null })
    try {
      await this.updater.checkForUpdates()
      // المكتبة ممكن ترجع بدون أي حدث إذا ما في تحديث.
      if (this.#view.state === 'checking') this.#finished({ state: 'idle', version: null })
    } catch {
      this.#finished({ state: 'failed', reason: 'network' })
    }
    return this.view()
  }

  /** بس نسخة انفحص توقيعها. */
  install(): boolean {
    if (this.#view.state !== 'ready') return false
    this.updater.quitAndInstall(true, true)
    return true
  }
}
