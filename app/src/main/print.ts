// تشغيل الطباعة: نافذة مخفية بتفتح صفحة الطباعة، بتستنى لحد ما تجهز، وبعدها بتطبع أو بتحفظ PDF.
// صفحة الطباعة نفسها من بناء الواجهة، فالخطوط المحلية والعربي نفس البرنامج.

import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, type WebContentsPrintOptions } from 'electron'
import type { PrintJob } from '@shared/print'

const READY_TIMEOUT_MS = 15_000

interface Pending {
  job: PrintJob
  ready: () => void
}

const jobs = new Map<string, Pending>()

/** صفحة الطباعة بتطلب شغلها بالرقم. رقم مش معروف ما بيرجع شي. */
export function takeJob(id: string): PrintJob | null {
  return jobs.get(id)?.job ?? null
}

export function markReady(id: string): void {
  jobs.get(id)?.ready()
}

export type PrintOutcome = { ok: true; path?: string } | { ok: false; reason: 'cancelled' | 'failed'; detail?: string }

/** مقاس الورقة. الحرارية 80mm وطول الكرت. A4 للباقي. */
function pageSize(job: PrintJob): WebContentsPrintOptions['pageSize'] {
  if (job.kind === 'cards' && job.template === 'thermal') return { width: 80_000, height: 55_000 }
  return 'A4'
}

/**
 * mode = dialog: نافذة الطباعة تبعت Windows، والمستخدم بيختار الطابعة. لو لغاها، النتيجة cancelled.
 * mode = pdf: بيحفظ الملف بالمسار. NUQTA_PRINT_PDF_DIR بيحول كل الطباعة لـPDF (للفحص بدون طابعة).
 */
export async function runPrint(job: PrintJob, mode: { kind: 'dialog' } | { kind: 'pdf'; path: string }): Promise<PrintOutcome> {
  const testDir = process.env['NUQTA_PRINT_PDF_DIR']
  if (mode.kind === 'dialog' && testDir) mode = { kind: 'pdf', path: join(testDir, `${job.kind}-${Date.now()}.pdf`) }

  const id = randomUUID()
  let ready!: () => void
  const isReady = new Promise<void>((r) => { ready = r })
  jobs.set(id, { job, ready })

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  try {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) await win.loadURL(`${devUrl}/print.html#${id}`)
    else await win.loadFile(join(__dirname, '../renderer/print.html'), { hash: id })

    const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), READY_TIMEOUT_MS))
    if ((await Promise.race([isReady, timeout])) === 'timeout') return { ok: false, reason: 'failed', detail: 'print page did not render' }

    if (mode.kind === 'pdf') {
      const data = await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true })
      await writeFile(mode.path, data)
      // للفحص بدون طابعة: صورة من نفس الصفحة جنب الـPDF.
      if (testDir) {
        const thermal = job.kind === 'cards' && job.template === 'thermal'
        const [w, h] = thermal ? [302, 208] : [794, job.kind === 'cards' ? 1123 : 1400]
        win.setContentSize(w, h)
        await new Promise((r) => setTimeout(r, 300))
        await writeFile(mode.path.replace(/\.pdf$/, '.png'), (await win.webContents.capturePage()).toPNG())
      }
      return { ok: true, path: mode.path }
    }

    return await new Promise<PrintOutcome>((resolve) => {
      win.webContents.print({ silent: false, printBackground: true, pageSize: pageSize(job), margins: { marginType: 'none' } }, (success, reason) => {
        if (success) resolve({ ok: true })
        else resolve({ ok: false, reason: /cancel/i.test(reason) ? 'cancelled' : 'failed', detail: reason })
      })
    })
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }
  } finally {
    jobs.delete(id)
    win.destroy()
  }
}
