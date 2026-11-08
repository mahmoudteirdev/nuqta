// الدخول برمز (PIN) لكل مستخدم. الرمز ما بينحفظ: بينحفظ hash بـscrypt مع ملح عشوائي.
// الجلسة بالعملية الرئيسية بس، فالواجهة ما بتقدر تدّعي إنها داخلة.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { SessionInfo, UserRole } from '@shared/api'
import type { Db } from './db/db'

/** 4 لـ8 أرقام. الأرقام العربية بتنقبل (١٢٣٤). */
export function normalizePin(pin: string): string | null {
  const p = pin.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  return /^\d{4,8}$/.test(p) ? p : null
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 32)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'base64')
  const got = scryptSync(pin, Buffer.from(salt, 'base64'), want.length)
  return timingSafeEqual(want, got)
}

/** بعد هالعدد من المحاولات الغلط، المستخدم بيستنى. كل قفل بيطول. */
const MAX_TRIES = 5
const LOCK_MS = 30_000

export type AuthError = 'pin_format' | 'pin_wrong' | 'locked' | 'not_found' | 'inactive' | 'owner_exists' | 'last_owner' | 'self'

interface UserRow {
  id: number
  name: string
  role: UserRole
  pin_hash: string | null
  active: number
  pin_fails: number
  pin_rounds: number
  pin_locked_until: number
}

export class Auth {
  current: { id: number; name: string; role: UserRole } | null = null

  constructor(
    private readonly db: () => Db | null,
    private readonly clock: () => number = () => Date.now(),
    private readonly onChange: (actor: string) => void = () => {}
  ) {}

  #rows(): UserRow[] {
    return this.db()?.all<UserRow>('SELECT id, name, role, pin_hash, active, pin_fails, pin_rounds, pin_locked_until FROM users ORDER BY id') ?? []
  }

  /** ما في ولا مستخدم إله رمز. */
  needsOwnerPin(): boolean {
    return !!this.db() && !this.#rows().some((u) => u.pin_hash && u.active)
  }

  /** اسم الكاتب بالدفتر: u:<id> للداخل، و«owner» لنسخ قديمة قبل الدخول. */
  actor(): string {
    return this.current ? `u:${this.current.id}` : 'owner'
  }

  info(lockAfterMinutes: number): SessionInfo {
    return {
      user: this.current,
      needsOwnerPin: this.needsOwnerPin(),
      users: this.#rows().filter((u) => u.active && u.pin_hash).map((u) => ({ id: u.id, name: u.name, role: u.role })),
      lockAfterMinutes
    }
  }

  #set(u: { id: number; name: string; role: UserRole } | null): void {
    this.current = u
    this.onChange(this.actor())
  }

  createOwnerPin(pin: string, now: string): AuthError | null {
    const db = this.db()
    if (!db) return 'not_found'
    if (!this.needsOwnerPin()) return 'owner_exists'
    const p = normalizePin(pin)
    if (!p) return 'pin_format'
    let owner = this.#rows().find((u) => u.role === 'owner' && u.active)
    if (!owner) {
      const id = db.run("INSERT INTO users(name, role, created_at) VALUES ('صاحب الشبكة', 'owner', ?)", now).id
      owner = { id, name: 'صاحب الشبكة', role: 'owner', pin_hash: null, active: 1, pin_fails: 0, pin_rounds: 0, pin_locked_until: 0 }
    }
    db.run('UPDATE users SET pin_hash = ? WHERE id = ?', hashPin(p), owner.id)
    this.#set({ id: owner.id, name: owner.name, role: 'owner' })
    return null
  }

  login(userId: number, pin: string): AuthError | null {
    const u = this.#rows().find((x) => x.id === userId)
    if (!u || !u.pin_hash) return 'not_found'
    if (!u.active) return 'inactive'
    if (u.pin_locked_until > this.clock()) return 'locked'
    const p = normalizePin(pin)
    if (!p || !verifyPin(p, u.pin_hash)) {
      let fails = u.pin_fails + 1
      let rounds = u.pin_rounds
      let until = 0
      if (fails >= MAX_TRIES) {
        rounds++
        until = this.clock() + LOCK_MS * rounds
        fails = 0
      }
      this.db()!.run('UPDATE users SET pin_fails = ?, pin_rounds = ?, pin_locked_until = ? WHERE id = ?', fails, rounds, until, userId)
      return until ? 'locked' : 'pin_wrong'
    }
    this.db()!.run('UPDATE users SET pin_fails = 0, pin_rounds = 0, pin_locked_until = 0 WHERE id = ?', userId)
    this.#set({ id: u.id, name: u.name, role: u.role })
    return null
  }

  /** ثواني لحد ما يقدر يجرب مرة ثانية. */
  lockedFor(userId: number): number {
    const until = this.#rows().find((u) => u.id === userId)?.pin_locked_until ?? 0
    return until > this.clock() ? Math.ceil((until - this.clock()) / 1000) : 0
  }

  logout(): void {
    this.#set(null)
  }

  setPin(userId: number, pin: string): AuthError | null {
    const p = normalizePin(pin)
    if (!p) return 'pin_format'
    const r = this.db()?.run('UPDATE users SET pin_hash = ?, pin_fails = 0, pin_rounds = 0, pin_locked_until = 0 WHERE id = ?', hashPin(p), userId)
    if (!r?.changes) return 'not_found'
    return null
  }

  /** صاحب الشبكة نسي رمزه: مفتاح استرجاع موقّع انفحص قبل هون. بيغيّر رمز أول مدير شغال وبيدخّله. */
  resetOwnerPin(pin: string): AuthError | null {
    const owner = this.#rows().find((u) => u.role === 'owner' && u.active)
    if (!owner) return 'not_found'
    const e = this.setPin(owner.id, pin)
    if (e) return e
    this.#set({ id: owner.id, name: owner.name, role: 'owner' })
    return null
  }

  setActive(userId: number, active: boolean): AuthError | null {
    const rows = this.#rows()
    const u = rows.find((x) => x.id === userId)
    if (!u) return 'not_found'
    if (!active && this.current?.id === userId) return 'self'
    if (!active && u.role === 'owner' && rows.filter((x) => x.role === 'owner' && x.active && x.pin_hash).length <= 1) return 'last_owner'
    this.db()!.run('UPDATE users SET active = ? WHERE id = ?', active ? 1 : 0, userId)
    return null
  }
}
