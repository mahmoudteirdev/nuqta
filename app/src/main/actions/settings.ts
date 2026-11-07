// شاشة الإعدادات: بيانات الشبكة، المستخدمون، والقيم المؤقتة.

import type { Backend, UserRole } from '@shared/api'
import type { Db } from '../db/db'
import type { Store } from '../db/store'
import { invalidRule, LIMITS, readRules, saveRules } from '../rules'

const ROLES: readonly UserRole[] = ['owner', 'technician']
/** أرقام ومسافات وشرطة و+ بس، عشان الرقم يطلع مزبوط على الكرت. */
const PHONE = /^[+\d][\d\s-]{0,19}$/

type SettingsBackend = Pick<Backend, 'networkSettings' | 'saveNetworkSettings' | 'users' | 'addUser' | 'rules' | 'saveRules'>

export function settingsActions(ctx: { db: () => Db; store: () => Store; now?: () => string }): SettingsBackend {
  const now = ctx.now ?? (() => new Date().toISOString())

  /** صاحب الشبكة موجود دايما كأول مستخدم. */
  const ensureOwner = () => {
    const db = ctx.db()
    if (!db.get('SELECT 1 FROM users LIMIT 1')) db.run("INSERT INTO users(name, role, created_at) VALUES ('صاحب الشبكة', 'owner', ?)", now())
  }

  return {
    networkSettings: () => ({ networkName: ctx.store().getSetting('network_name') ?? '', phone: ctx.store().getSetting('support_phone') ?? '' }),

    saveNetworkSettings: (s) => {
      const name = s.networkName.trim()
      const phone = s.phone.trim()
      if (!name) return { ok: false, error: { code: 'network_name' } }
      if (phone && !PHONE.test(phone)) return { ok: false, error: { code: 'phone_invalid' } }
      ctx.store().setSetting('network_name', name)
      ctx.store().setSetting('support_phone', phone)
      return { ok: true, value: undefined }
    },

    users: () => {
      ensureOwner()
      return ctx.db().all<{ id: number; name: string; role: UserRole }>('SELECT id, name, role FROM users ORDER BY id')
    },

    addUser: (u) => {
      const name = u.name.trim()
      if (!name) return { ok: false, error: { code: 'user_name' } }
      if (!ROLES.includes(u.role)) return { ok: false, error: { code: 'user_role' } }
      ensureOwner()
      const id = ctx.db().run('INSERT INTO users(name, role, created_at) VALUES (?, ?, ?)', name, u.role, now()).id
      return { ok: true, value: { id } }
    },

    rules: () => readRules(ctx.store()),

    saveRules: (r) => {
      const bad = invalidRule(r)
      if (bad) return { ok: false, error: { code: `rule_${bad}`, range: LIMITS[bad] } }
      saveRules(ctx.store(), r)
      return { ok: true, value: undefined }
    }
  }
}
