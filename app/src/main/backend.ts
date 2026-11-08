// العملية الرئيسية: قاعدة البيانات، والراوتر، والمزامنة بالخلفية، والقناة اللي بتنادي منها الواجهة.

import { app, BrowserWindow, dialog, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { writeFile } from 'node:fs/promises'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppStatus, Backend, DbStatus, UpdateView } from '@shared/api'
import { openDatabase, type Db } from './db/db'
import { accountActions } from './actions/account'
import { batchActions } from './actions/batch'
import { cardActions } from './actions/card'
import { cardsActions } from './actions/cards'
import { networkData } from './actions/network'
import { settingsActions } from './actions/settings'
import { setupActions, setupState } from './actions/setup'
import { autoBackupIfDue, backupActions } from './actions/backup'
import { importActions } from './actions/import'
import { licenseActions, pinResetActions } from './actions/license'
import { deviceCode } from './license'
import { LICENSE_PUBLIC_KEY } from './license-public-key'
import { devEnv } from './dev-env'
import { UpdateService, type UpdaterLike } from './updates'
import { installedAt, machineId } from './machine'
import { Auth, type AuthError } from './auth'
import { allowed } from '@shared/permissions'
import { readFile } from 'node:fs/promises'
import { ensureDir, listBackups, makeBackup } from './backup'
import { reportCsv, reportJob, reportsData } from './db/reports'
import { accountData, homeData } from './db/queries'
import { markReady, runPrint, takeJob } from './print'
import { Store } from './db/store'
import { seedDemo } from './dev/seed'
import { clientFromConfig, connectRouter, NoRouter, readRouterConfig, type MakeClient, type SecretBox } from './router/connect'
import { MockRouter } from './router/mock'
import { RouterOsClient } from './router/routeros'
import { RouterService } from './router/service'
import type { RouterClient } from './router/types'

const SYNC_EVERY_MS = 15_000

interface Live {
  db: Db
  store: Store
  router: RouterClient
  mock: MockRouter | null
  /** راوتر حقيقي محفوظ بالإعدادات. */
  configured: boolean
  service: RouterService
}

/** كلمة مرور الراوتر مشفرة بمخزن النظام (DPAPI على Windows). */
const secrets: SecretBox = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (b) => safeStorage.decryptString(Buffer.from(b, 'base64'))
}

const makeClient: MakeClient = (o) => new RouterOsClient(o)

/** الكروت اللي لازم تكون على الراوتر الوهمي، من قاعدة البيانات. لأن الوهمي بينسى كل شي لما البرنامج يسكر. */
function hydrateMock(db: Db, mock: MockRouter): void {
  mock.load(
    db.all<{ code: string; no: number; profile: string; used: number; disabled: number }>(
      `SELECT c.code, b.no, k.router_profile profile, c.first_used_at IS NOT NULL used, c.status = 'returned' disabled
       FROM cards c JOIN batches b ON b.id = c.batch_id JOIN categories k ON k.id = b.category_id
       WHERE c.status NOT IN ('generated', 'pending')`
    ).map((r) => ({ name: r.code, profile: r.profile, comment: `nuqta:B-${r.no}`, uptimeSeconds: r.used ? 600 : 0, disabled: !!r.disabled }))
  )
  // كم جلسة مفتوحة عشان شاشة الشبكة يكون فيها متصلين وقت التطوير.
  const live = db.all<{ code: string }>("SELECT code FROM cards WHERE status = 'active' ORDER BY first_used_at DESC LIMIT 5")
  live.forEach((c, i) => mock.use(c.code, 300 + i * 900, `4F:A2:00:00:00:${String(i + 10)}`))
}

/**
 * أي راوتر نحكي معه: المحفوظ بالإعدادات أول. وضع التطوير بدون راوتر محفوظ بيشتغل على الوهمي،
 * والنسخة المبنية بدون راوتر ما بتحكي مع حدا لحد ما ينربط واحد. NUQTA_MOCK=1 بيجبر الوهمي.
 */
function chooseRouter(db: Db, store: Store, dev: boolean): Pick<Live, 'router' | 'mock' | 'configured'> {
  const cfg = readRouterConfig(store)
  if (cfg && !devEnv('NUQTA_MOCK') && secrets.available()) {
    return { router: clientFromConfig(cfg, { makeClient, secrets }), mock: null, configured: true }
  }
  if (dev) {
    // تأخير بسيط عشان حالة «جاري الإرسال» تبين وقت التطوير، زي الراوتر الحقيقي.
    const mock = new MockRouter({ delayMs: 400 })
    hydrateMock(db, mock)
    return { router: mock, mock, configured: false }
  }
  return { router: new NoRouter(), mock: null, configured: false }
}

function migrateFromLegacyUserData(currentDir: string, dev: boolean): void {
  try {
    const legacyDir = join(dirname(currentDir), 'نقطة')
    if (existsSync(legacyDir) && legacyDir !== currentDir) {
      const dbName = dev ? 'nuqta-dev.db' : 'nuqta.db'
      const legacyDb = join(legacyDir, dbName)
      const currentDb = join(currentDir, dbName)
      if (existsSync(legacyDb) && !existsSync(currentDb)) {
        mkdirSync(currentDir, { recursive: true })
        copyFileSync(legacyDb, currentDb)
        for (const ext of ['-wal', '-shm']) {
          if (existsSync(legacyDb + ext)) copyFileSync(legacyDb + ext, currentDb + ext)
        }
        for (const meta of ['device-id', 'install.json']) {
          const src = join(legacyDir, meta)
          const dst = join(currentDir, meta)
          if (existsSync(src) && !existsSync(dst)) copyFileSync(src, dst)
        }
        const legacyBackups = join(legacyDir, dev ? 'backups-dev' : 'backups')
        const currentBackups = join(currentDir, dev ? 'backups-dev' : 'backups')
        if (existsSync(legacyBackups) && !existsSync(currentBackups)) {
          mkdirSync(currentBackups, { recursive: true })
          for (const f of readdirSync(legacyBackups)) {
            copyFileSync(join(legacyBackups, f), join(currentBackups, f))
          }
        }
      }
    }
  } catch (e) {
    console.error('[migration] legacy migration failed', e)
  }
}

export function startBackend(): AppStatus {
  const dev = !app.isPackaged
  const userDir = app.getPath('userData')
  migrateFromLegacyUserData(userDir, dev)
  const path = devEnv('NUQTA_DB') || join(userDir, dev ? 'nuqta-dev.db' : 'nuqta.db')
  const backupDir = ensureDir(devEnv('NUQTA_BACKUP_DIR') || join(userDir, dev ? 'backups-dev' : 'backups'))
  // نسخة من الوضع القديم قبل ما التحديث يعدّل الجداول. فشلها ما بيوقف البرنامج: الترقية نفسها بمعاملة.
  const opened = openDatabase(path, (old) => {
    try {
      makeBackup(old, backupDir, 'before-update')
    } catch (e) {
      console.error('[backup] backup before update failed', e)
    }
  })
  let live: Live | null = null
  let dbStatus: DbStatus
  const router = { up: false, lastSeenAt: null as string | null }

  if (opened.ok) {
    const { db } = opened
    const store = new Store(db)
    if (dev && !store.distributors().length && !devEnv('NUQTA_NO_SEED')) seedDemo(db)
    const r = chooseRouter(db, store, dev)
    live = { db, store, ...r, service: new RouterService(store, r.router) }
    dbStatus = { ok: true, path, version: opened.version, distributors: store.distributors().length }
    try {
      autoBackupIfDue(db, backupDir)
    } catch (e) {
      console.error('[backup] auto backup failed', e)
    }
  } else {
    dbStatus = { ok: false, path, reason: opened.reason, detail: opened.detail }
    console.error(`[db] ${opened.reason}: ${opened.detail}`)
  }

  // الدخول: الجلسة هون بس، والكاتب بالدفتر بيتبع المستخدم الداخل.
  const auth = new Auth(() => live?.db ?? null, Date.now, (actor) => { if (live) live.store.actor = actor })
  const lockAfter = () => Number(live?.store.getSetting('lock_after_minutes') ?? 15)
  const authResult = (e: AuthError | null, userId?: number) =>
    e ? { ok: false as const, error: { code: `auth_${e}`, held: e === 'locked' && userId ? auth.lockedFor(userId) : undefined } } : { ok: true as const, value: undefined }
  const isTech = () => auth.current?.role === 'technician'

  const device = deviceCode(machineId(app.getPath('userData')))
  const pinReset = pinResetActions({
    store: () => live?.store ?? null,
    device,
    publicKeyPem: LICENSE_PUBLIC_KEY,
    resetOwnerPin: (pin) => auth.resetOwnerPin(pin)
  })
  const lic = licenseActions({
    store: () => live?.store ?? null,
    device,
    installedAt: installedAt(app.getPath('userData')),
    publicKeyPem: LICENSE_PUBLIC_KEY
  })

  let ticking: Promise<void> | null = null
  /** فحص الراوتر، وبعده الاستخدام والطابور. ما بيشتغل مرتين بنفس الوقت. */
  const tick = (): Promise<void> => {
    if (!live) return Promise.resolve()
    const l = live
    ticking ??= (async () => {
      const info = await l.service.test()
      router.up = info.ok
      if (!info.ok) return
      router.lastSeenAt = new Date().toISOString()
      const id = l.store.routers()[0]?.id
      if (id) l.store.updateRouter(id, { lastSeenAt: router.lastSeenAt })
      await l.service.syncUsage()
      await l.service.flushOutbox()
    })().finally(() => { ticking = null })
    return ticking
  }
  void tick()
  const timer = setInterval(() => void tick(), SYNC_EVERY_MS)
  // النسخة اليومية للبرنامج اللي بيضل مفتوح أيام.
  const backupTimer = setInterval(() => {
    if (!live) return
    try { autoBackupIfDue(live.db, backupDir) } catch (e) { console.error('[backup] auto backup failed', e) }
  }, 3_600_000)

  const need = (): Live => {
    if (!live) throw new Error(`database unavailable: ${dbStatus.ok ? '' : dbStatus.reason}`)
    return live
  }

  // التحديث بالنسخة المثبتة بس.
  let updates: UpdateService | null = null
  let updateTimer: ReturnType<typeof setInterval> | null = null
  const offView: UpdateView = { current: app.getVersion(), state: 'off', version: null, percent: 0, reason: null, checkedAt: null }
  const updateView = (): UpdateView => updates?.view() ?? offView
  if (app.isPackaged) {
    void import('electron-updater').then(({ autoUpdater }) => {
      updates = new UpdateService(autoUpdater as unknown as UpdaterLike, app.getVersion(), LICENSE_PUBLIC_KEY)
      // فحص بعد ما البرنامج يهدا، وبعدها كل 6 ساعات. بدون نت ما بيصير شي.
      setTimeout(() => void updates?.check(), 30_000)
      updateTimer = setInterval(() => void updates?.check(), 6 * 3_600_000)
    }).catch((e) => console.error('[update] not available', e))
  }

  function getInstallerLang(): 'ar' | 'en' | null {
    try {
      const candidates = [
        join(process.resourcesPath, '..', 'installer-lang.json'),
        join(app.getAppPath(), 'installer-lang.json'),
        join(process.cwd(), 'installer-lang.json')
      ]
      for (const p of candidates) {
        if (existsSync(p)) {
          const json = JSON.parse(readFileSync(p, 'utf8'))
          if (json.lang === 'ar' || json.lang === 'en') return json.lang
        }
      }
    } catch {}
    return null
  }

  const status = (): AppStatus => ({
    db: dbStatus,
    router: { ...router, mock: !!live?.mock, configured: !!live?.configured },
    networkName: live?.store.getSetting('network_name') ?? 'نقطة',
    dev,
    setup: live ? setupState(live.store) : { needed: false, step: 1 },
    lastBackupAt: listBackups(backupDir)[0]?.at ?? null,
    license: lic.info(),
    session: auth.info(lockAfter()),
    update: updateView(),
    installerLang: getInstallerLang()
  })

  const backend: Backend = {
    status,
    ...accountActions({
      db: () => need().db,
      store: () => need().store,
      routerUp: () => router.up,
      afterChange: () => void tick()
    }),
    ...cardsActions({ db: () => need().db, store: () => need().store, service: () => need().service, print: (job) => runPrint(job, { kind: 'dialog' }) }),
    ...cardActions({ db: () => need().db, service: () => need().service }),
    ...settingsActions({ db: () => need().db, store: () => need().store }),
    ...setupActions({ store: () => need().store, service: () => need().service }),
    ...batchActions({
      db: () => need().db,
      store: () => need().store,
      service: () => need().service,
      afterSend: (up) => {
        router.up = up
        if (up) router.lastSeenAt = new Date().toISOString()
      },
      print: (job) => runPrint(job, { kind: 'dialog' }),
      canGenerate: () => lic.info().state !== 'expired',
      role: () => auth.current?.role ?? null
    }),
    license: lic.license,
    activateLicense: lic.activateLicense,
    checkForUpdate: async () => (updates ? updates.check() : offView),
    installUpdate: () => {
      if (updateView().state !== 'ready' || !updates) return { ok: false, error: { code: 'update_not_ready' } }
      // نسخة من الوضع الحالي قبل التحديث. فشلها ما بيوقف التحديث.
      try {
        if (live) makeBackup(live.db, backupDir, 'before-update')
      } catch (e) {
        console.error('[backup] backup before update failed', e)
      }
      if (updateTimer) clearInterval(updateTimer)
      updates.install()
      return { ok: true, value: undefined }
    },
    ...backupActions({
      dir: backupDir,
      dbPath: path,
      db: () => live?.db ?? null,
      closeDb: () => {
        clearInterval(timer)
        clearInterval(backupTimer)
        live?.router.close()
        live?.db.close()
        live = null
      },
      relaunch: () => setTimeout(() => { app.relaunch(); app.exit(0) }, 400),
      pickSave: async (name) => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const opts = { title: 'احفظ نسخة', defaultPath: name, filters: [{ name: 'نسخة نقطة', extensions: ['db'] }] }
        const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
        return r.canceled || !r.filePath ? null : r.filePath
      },
      pickOpen: async () => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const opts = { title: 'اختر نسخة', properties: ['openFile' as const], filters: [{ name: 'نسخة نقطة', extensions: ['db'] }] }
        const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
        return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
      }
    }),
    ...importActions({
      db: () => need().db,
      store: () => need().store,
      afterImport: () => void tick(),
      pickFile: async () => {
        const fixed = devEnv('NUQTA_IMPORT_FILE')
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const opts = { title: 'اختر ملف CSV', properties: ['openFile' as const], filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] }
        const path = fixed || (await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))).filePaths[0]
        if (!path) return null
        return { name: path, bytes: new Uint8Array(await readFile(path)) }
      }
    }),
    printJob: (id) => takeJob(id),
    printReady: (id) => markReady(id),
    printStatement: async (id) => {
      const l = need()
      const now = new Date().toISOString()
      const cur = accountData(l.db, l.store, id, now).current
      if (!cur || cur.id !== id) return { ok: false, error: { code: 'not_found' } }
      const out = await runPrint({
        kind: 'statement', networkName: l.store.getSetting('network_name') ?? '', distributorName: cur.name, area: cur.area, printedAt: now,
        held: cur.held, usedValueAg: cur.usedValueAg, paidAg: cur.paidAg, owedAg: cur.owedAg, creditLimitAg: cur.creditLimitAg,
        entries: [...cur.entries].reverse().filter((e) => !(e.type === 'opening' && e.chargeAg === 0))
      }, { kind: 'dialog' })
      return out.ok ? { ok: true, value: undefined } : { ok: false, error: { code: out.reason === 'cancelled' ? 'print_cancelled' : 'print_failed' } }
    },
    exportReportPdf: async (tab, days) => {
      const l = need()
      const now = new Date().toISOString()
      const names = { collected: 'المحصل', commission: 'العمولة', stale: 'الكروت-الراكدة' }
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const opts = { title: 'تصدير التقرير', defaultPath: `نقطة-${names[tab]}-${now.slice(0, 10)}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
      const pdfDir = devEnv('NUQTA_PRINT_PDF_DIR')
      const pick = pdfDir
        ? { canceled: false, filePath: join(pdfDir, `report-${tab}.pdf`) }
        : win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (pick.canceled || !pick.filePath) return { ok: true, value: { cancelled: true } }
      const job = reportJob(reportsData(l.db, l.store, days, now), tab, l.store.getSetting('network_name') ?? '', now)
      const out = await runPrint(job, { kind: 'pdf', path: pick.filePath })
      return out.ok ? { ok: true, value: { path: pick.filePath } } : { ok: false, error: { code: 'print_failed' } }
    },
    home: () => {
      const l = need()
      const h = homeData(l.db, l.store, { now: new Date().toISOString(), routerUp: router.up })
      // الفني ما بيشوف المال: بيشوف مهام الراوتر والدفعات والمخزون بس.
      if (!isTech()) return h
      return { usedTodayAg: 0, collectedTodayAg: 0, owedTotalAg: 0, usageToday: [], limited: true, tasks: h.tasks.filter((t) => t.kind === 'router' || t.kind === 'pending' || t.kind === 'stock') }
    },
    createOwnerPin: (pin) => authResult(auth.createOwnerPin(pin, new Date().toISOString())),
    login: (id, pin) => authResult(auth.login(id, pin), id),
    logout: () => auth.logout(),
    ...pinReset,
    setUserPin: (id, pin) => authResult(auth.setPin(id, pin)),
    setUserActive: (id, active) => authResult(auth.setActive(id, active)),
    setLockAfter: (minutes) => {
      if (![0, 5, 15, 30, 60].includes(minutes)) return { ok: false, error: { code: 'amount_invalid' } }
      need().store.setSetting('lock_after_minutes', String(minutes))
      return { ok: true, value: undefined }
    },
    network: () => {
      const l = need()
      return networkData({ db: l.db, store: l.store, service: l.service, router, mock: !!l.mock, configured: l.configured })
    },
    hotspotServers: async () => {
      const l = need()
      const res = await l.service.hotspotServers()
      return res.ok ? res.value.map((s) => s.name) : []
    },
    savePool: async (p) => {
      const l = need()
      const name = p.name.trim()
      const ranges = p.ranges.trim()
      if (!name || !ranges) return { ok: false, error: { code: 'field_required' } }
      const res = p.id ? await l.service.updatePool(p.id, ranges) : await l.service.addPool(name, ranges)
      if (!res.ok) return { ok: false, error: { code: 'router_unreachable' } }
      return { ok: true, value: undefined }
    },
    deletePool: async (nameOrId) => {
      const l = need()
      const res = await l.service.deletePool(nameOrId)
      if (!res.ok) return { ok: false, error: { code: 'router_unreachable' } }
      return { ok: true, value: undefined }
    },
    connectRouter: async (input) => {
      const l = need()
      const devMock = dev && devEnv('NUQTA_MOCK') && l.mock ? l.mock : null
      const r = await connectRouter(l.store, input, { makeClient: devMock ? () => devMock : makeClient, secrets })
      if (!r.ok) return r
      if (devMock) {
        l.store.setSetting('setup_step', '2')
        router.up = true
        return { ok: true, value: { name: r.value.info.identity || input.host, profiles: r.value.info.profiles } }
      }
      // البرنامج بيبدّل على الراوتر الحقيقي فورا. الوهمي بيروح.
      if (ticking) await ticking
      l.router.close()
      l.router = r.value.client
      l.mock = null
      l.configured = true
      l.service = new RouterService(l.store, l.router)
      router.up = true
      router.lastSeenAt = new Date().toISOString()
      if (setupState(l.store).needed) l.store.setSetting('setup_step', '2')
      void tick()
      return { ok: true, value: { name: r.value.info.identity || input.host, profiles: r.value.info.profiles } }
    },
    reports: (days) => {
      const l = need()
      return reportsData(l.db, l.store, days, new Date().toISOString())
    },
    exportReport: async (tab, days) => {
      const l = need()
      const names = { collected: 'المحصل', commission: 'العمولة', stale: 'الكروت-الراكدة' }
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const opts = {
        title: 'تصدير التقرير',
        defaultPath: `نقطة-${names[tab]}-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'Excel (CSV)', extensions: ['csv'] }]
      }
      const pick = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (pick.canceled || !pick.filePath) return { ok: true, value: { cancelled: true } }
      await writeFile(pick.filePath, reportCsv(reportsData(l.db, l.store, days, new Date().toISOString()), tab), 'utf8')
      return { ok: true, value: { path: pick.filePath } }
    },
    devSetRouter: (up) => {
      if (!dev) throw new Error('dev only')
      const l = need()
      if (l.mock) l.mock.up = up
      router.up = up && router.up
      void tick()
    }
  }

  ipcMain.handle('api', async (e: IpcMainInvokeEvent, method: unknown, args: unknown) => {
    if (!trustedSender(e)) throw new Error('untrusted sender')
    if (typeof method !== 'string' || !Object.hasOwn(backend, method) || !Array.isArray(args)) throw new Error(`unknown method ${String(method)}`)
    // الصلاحية بتنفحص هون، مش بالواجهة: الواجهة بتخبي بس.
    const access = {
      role: auth.current?.role ?? null,
      setupOpen: !!live && setupState(live.store).needed && auth.needsOwnerPin(),
      dbBroken: !live,
      dev
    }
    if (!allowed(method as keyof Backend, access)) throw new Error(`not_allowed:${method}`)
    // بعد أي كتابة، الحالة لازم تكون جديدة عند الواجهة. tick بيضمن إن حالة الراوتر محدثة لأول طلب.
    if (method === 'status' && ticking) await ticking
    return (backend[method as keyof Backend] as (...a: unknown[]) => unknown)(...args)
  })

  app.on('will-quit', () => {
    clearInterval(timer)
    clearInterval(backupTimer)
    live?.router.close()
    live?.db.close()
  })
  return status()
}

/** بس صفحات البرنامج نفسه بتقدر تنادي. */
function trustedSender(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  const devUrl = devEnv('ELECTRON_RENDERER_URL')
  return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
}
