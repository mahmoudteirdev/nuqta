import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Auth, hashPin, normalizePin, verifyPin } from './auth'
import { openDatabase, type Db } from './db/db'

let db: Db
let t = 0
let actors: string[] = []
let auth: Auth
const now = new Date(2026, 10, 7, 9, 0).toISOString()

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  t = 1_000_000
  actors = []
  auth = new Auth(() => db, () => t, (a) => actors.push(a))
})
afterEach(() => db.close())

const addUser = (name: string, role: 'owner' | 'technician', pin: string | null) =>
  db.run('INSERT INTO users(name, role, created_at, pin_hash) VALUES (?, ?, ?, ?)', name, role, now, pin ? hashPin(pin) : null).id

describe('PIN', () => {
  it('accepts 4 to 8 digits, Arabic and Persian digits included', () => {
    expect(normalizePin(' 1234 ')).toBe('1234')
    expect(normalizePin('١٢٣٤٥')).toBe('12345')
    expect(normalizePin('۱۲۳۴')).toBe('1234')
    for (const bad of ['123', '123456789', '12a4', '', '12 34']) expect(normalizePin(bad)).toBeNull()
  })

  it('stores a salted hash, never the PIN', () => {
    const a = hashPin('1234')
    const b = hashPin('1234')
    expect(a).not.toContain('1234')
    expect(a).not.toBe(b)
    expect(verifyPin('1234', a)).toBe(true)
    expect(verifyPin('4321', a)).toBe(false)
    expect(verifyPin('1234', 'plain1234')).toBe(false)
  })
})

describe('owner PIN on a fresh database', () => {
  it('is asked once, creates the owner, and signs them in', () => {
    expect(auth.needsOwnerPin()).toBe(true)
    expect(auth.info(15)).toMatchObject({ user: null, needsOwnerPin: true, users: [] })
    expect(auth.createOwnerPin('12', now)).toBe('pin_format')
    expect(auth.createOwnerPin('١٢٣٤', now)).toBeNull()
    expect(auth.current).toMatchObject({ name: 'صاحب الشبكة', role: 'owner' })
    expect(auth.actor()).toBe(`u:${auth.current!.id}`)
    expect(actors.at(-1)).toBe(auth.actor())
    expect(auth.needsOwnerPin()).toBe(false)
    expect(auth.createOwnerPin('9999', now)).toBe('owner_exists')
    auth.logout()
    expect(auth.login(auth.info(15).users[0]!.id, '1234')).toBeNull()
  })

  it('uses an existing owner row instead of adding a second one', () => {
    const id = addUser('أبو خالد', 'owner', null)
    expect(auth.createOwnerPin('1234', now)).toBeNull()
    expect(auth.current).toEqual({ id, name: 'أبو خالد', role: 'owner' })
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n).toBe(1)
  })
})

describe('login', () => {
  let owner: number
  let tech: number
  beforeEach(() => {
    owner = addUser('صاحب الشبكة', 'owner', '1234')
    tech = addUser('سامي', 'technician', '5678')
  })

  it('signs in with the right PIN and out again; the ledger actor follows', () => {
    expect(auth.login(tech, '1234')).toBe('pin_wrong')
    expect(auth.current).toBeNull()
    expect(auth.login(tech, '5678')).toBeNull()
    expect(auth.current).toEqual({ id: tech, name: 'سامي', role: 'technician' })
    expect(actors.at(-1)).toBe(`u:${tech}`)
    auth.logout()
    expect(auth.current).toBeNull()
    expect(actors.at(-1)).toBe('owner')
  })

  it('locks a user out after 5 wrong tries, longer each round', () => {
    for (let i = 0; i < 4; i++) expect(auth.login(tech, '0000')).toBe('pin_wrong')
    expect(auth.login(tech, '0000')).toBe('locked')
    expect(auth.lockedFor(tech)).toBe(30)
    expect(auth.login(tech, '5678')).toBe('locked')
    expect(auth.login(owner, '1234')).toBeNull()
    t += 31_000
    for (let i = 0; i < 4; i++) expect(auth.login(tech, '0000')).toBe('pin_wrong')
    expect(auth.login(tech, '0000')).toBe('locked')
    expect(auth.lockedFor(tech)).toBe(60)
    t += 61_000
    expect(auth.login(tech, '5678')).toBeNull()
  })

  it('a new PIN clears the lock; users without a PIN or stopped cannot sign in', () => {
    for (let i = 0; i < 5; i++) auth.login(tech, '0000')
    expect(auth.setPin(tech, '12')).toBe('pin_format')
    expect(auth.setPin(tech, '2468')).toBeNull()
    expect(auth.login(tech, '2468')).toBeNull()
    const noPin = addUser('بلا رمز', 'technician', null)
    expect(auth.login(noPin, '1234')).toBe('not_found')
    expect(auth.info(15).users.map((u) => u.name)).toEqual(['صاحب الشبكة', 'سامي'])
  })

  it('stopping a user: not yourself, not the last owner', () => {
    expect(auth.login(owner, '1234')).toBeNull()
    expect(auth.setActive(owner, false)).toBe('self')
    expect(auth.setActive(tech, false)).toBeNull()
    expect(auth.login(tech, '5678')).toBe('inactive')
    expect(auth.info(15).users.map((u) => u.name)).toEqual(['صاحب الشبكة'])
    auth.logout()
    expect(auth.setActive(owner, false)).toBe('last_owner')
    const second = addUser('شريك', 'owner', '1111')
    expect(auth.setActive(owner, false)).toBeNull()
    expect(auth.setActive(second, false)).toBe('last_owner')
    expect(auth.setActive(tech, true)).toBeNull()
    expect(auth.login(tech, '5678')).toBeNull()
  })
})
