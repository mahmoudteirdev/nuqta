// معرّف الجهاز لكود الترخيص، وتاريخ أول تشغيل للتجربة.
// الاثنين برا قاعدة البيانات: نقل نسخة لجهاز ثاني ما بينقل الترخيص، واسترجاع نسخة ما بيصفّر التجربة.

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** MachineGuid على Windows، IOPlatformUUID على Mac، machine-id على Linux. وإذا ما زبط: معرّف عشوائي محفوظ. */
export function machineId(userData: string): string {
  if (process.env['NUQTA_MACHINE_ID']) return process.env['NUQTA_MACHINE_ID']
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true })
      const m = /MachineGuid\s+REG_SZ\s+([0-9a-f-]+)/i.exec(out)
      if (m) return m[1]!
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' })
      const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)
      if (m) return m[1]!
    } else if (existsSync('/etc/machine-id')) {
      const id = readFileSync('/etc/machine-id', 'utf8').trim()
      if (id) return id
    }
  } catch {
    /* بيكمل للمعرّف المحفوظ */
  }
  const file = join(userData, 'device-id')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const id = randomUUID()
  writeFileSync(file, id)
  return id
}

/** أول تشغيل على هالجهاز. بيتسجل مرة وحدة وما بيتغير. */
export function installedAt(userData: string, now = new Date().toISOString()): string {
  // للفحص بس: تاريخ تثبيت مصطنع بدون ما نلمس ملف الجهاز.
  if (process.env['NUQTA_INSTALLED_AT']) return process.env['NUQTA_INSTALLED_AT']
  const file = join(userData, 'install.json')
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as { installedAt?: string }
    if (v.installedAt && !Number.isNaN(Date.parse(v.installedAt))) return v.installedAt
  } catch {
    /* أول مرة */
  }
  writeFileSync(file, JSON.stringify({ installedAt: now }))
  return now
}
