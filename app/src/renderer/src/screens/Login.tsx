import { useEffect, useRef, useState } from 'react'
import type { SessionInfo } from '@shared/api'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { Logo } from '@/shell/icons'

export function authError(code: string, held?: number): string {
  const key = `auth.err.${code}`
  const text = t(key, { held: held ?? 30 })
  if (text !== key) return text

  switch (code) {
    case 'auth_pin_format': return t('auth.err.auth_pin_format')
    case 'auth_pin_wrong': return t('auth.err.auth_pin_wrong')
    case 'auth_locked': return t('auth.err.auth_locked', { held: held ?? 30 })
    case 'auth_inactive': return t('auth.err.auth_inactive')
    case 'auth_not_found': return t('auth.err.auth_not_found')
    case 'auth_owner_exists': return t('auth.err.auth_owner_exists')
    case 'auth_last_owner': return t('auth.err.auth_last_owner')
    case 'auth_self': return t('auth.err.auth_self')
    case 'reset_invalid': return t('auth.err.reset_invalid')
    case 'reset_other_device': return t('auth.err.reset_other_device')
    case 'reset_wrong_request': return t('auth.err.reset_wrong_request')
    case 'reset_expired': return t('auth.err.reset_expired')
    default: return t('auth.err.default')
  }
}

/** صاحب الشبكة بيعمل رمزه أول مرة: بعد التحديث لنسخة فيها دخول، أو بعد أول تشغيل. */
function CreateOwnerPin() {
  const { dispatch } = useStore()
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="card login-card" onSubmit={async (e) => {
      e.preventDefault()
      if (pin !== again) return setErr(t('login.err.mismatch'))
      setBusy(true)
      const r = await api.createOwnerPin(pin)
      setBusy(false)
      if (!r.ok) return setErr(authError(r.error.code))
      dispatch({ type: 'go', screen: 'home' })
      dispatch({ type: 'status', status: await api.status() })
    }}>
      <h1 className="h1">{t('login.createOwner.title')}</h1>
      <p className="sub" style={{ margin: 0 }}>{t('login.createOwner.body')}</p>
      <div className="fld">
        <label className="lbl" htmlFor="op1">{t('login.createOwner.pin1')}</label>
        <div className={err ? 'box err' : 'box'} dir="ltr">
          <input id="op1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} aria-invalid={!!err} aria-describedby={err ? 'opE' : undefined} onChange={(e) => { setPin(e.target.value); setErr('') }} />
        </div>
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="op2">{t('login.createOwner.pin2')}</label>
        <div className={err ? 'box err' : 'box'} dir="ltr">
          <input id="op2" type="password" inputMode="numeric" autoComplete="new-password" value={again} aria-invalid={!!err} onChange={(e) => { setAgain(e.target.value); setErr('') }} />
        </div>
      </div>
      {err && <span id="opE" className="emsg" role="alert">{err}</span>}
      <button type="submit" className="btn btn-p" disabled={busy}>{busy ? t('login.createOwner.busy') : t('login.createOwner.btn')}</button>
    </form>
  )
}

/** صاحب الشبكة نسي رمزه: بيبعت الكودين للدعم، وبيرجعله مفتاح لمرة وحدة. */
function ResetPin({ onBack }: { onBack: () => void }) {
  const { dispatch } = useStore()
  const [codes, setCodes] = useState<{ deviceCode: string; requestCode: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [key, setKey] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void api.pinResetRequest().then(setCodes, () => setErr(t('auth.err.default'))) }, [])
  const clear = () => setErr('')

  return (
    <form className="card login-card" onSubmit={async (e) => {
      e.preventDefault()
      if (!key.trim()) return setErr(t('login.err.keyRequired'))
      if (pin !== again) return setErr(t('login.err.mismatch'))
      setBusy(true)
      const r = await api.pinResetApply(key, pin)
      setBusy(false)
      if (!r.ok) return setErr(authError(r.error.code))
      dispatch({ type: 'go', screen: 'home' })
      dispatch({ type: 'status', status: await api.status() })
    }}>
      <h1 className="h1">{t('login.reset.title')}</h1>
      <p className="sub" style={{ margin: 0 }}>{t('login.reset.body')}</p>
      {codes && (
        <div className="reset-codes">
          <span className="lbl">{t('login.reset.deviceCode')}</span><code className="mono" dir="ltr">{codes.deviceCode}</code>
          <span className="lbl">{t('login.reset.requestCode')}</span><code className="mono" dir="ltr">{codes.requestCode}</code>
          <button type="button" className="btn btn-s sm" onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${codes.deviceCode} ${codes.requestCode}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              setErr(t('login.err.copyFailed'))
            }
          }}>{copied ? t('login.reset.copied') : t('login.reset.copy')}</button>
        </div>
      )}
      <div className="fld"><label className="lbl" htmlFor="rk">{t('login.reset.key')}</label><div className="box" dir="ltr"><input id="rk" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); clear() }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="rp1">{t('login.reset.pin1')}</label><div className="box" dir="ltr"><input id="rp1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => { setPin(e.target.value); clear() }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="rp2">{t('login.reset.pin2')}</label><div className="box" dir="ltr"><input id="rp2" type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); clear() }} /></div></div>
      {err && <span className="emsg" role="alert">{err}</span>}
      <button type="submit" className="btn btn-p" disabled={busy}>{busy ? t('login.reset.busy') : t('login.reset.submit')}</button>
      <button type="button" className="btn btn-g" onClick={onBack}>{t('login.reset.back')}</button>
    </form>
  )
}

function PickAndPin({ session, onForgot }: { session: SessionInfo; onForgot: () => void }) {
  const { dispatch } = useStore()
  const [userId, setUserId] = useState(session.users.length === 1 ? session.users[0]!.id : session.users[0]?.id ?? 0)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [userId])

  return (
    <form className="card login-card" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      const r = await api.login(userId, pin)
      setBusy(false)
      setPin('')
      if (!r.ok) return setErr(authError(r.error.code, r.error.held))
      dispatch({ type: 'go', screen: 'home' })
      dispatch({ type: 'status', status: await api.status() })
    }}>
      <h1 className="h1">{t('login.title')}</h1>
      {session.users.length > 1 && (
        <div className="fld">
          <span className="lbl" id="who">{t('login.who')}</span>
          <div role="group" aria-labelledby="who" className="login-users">
            {session.users.map((u) => (
              <button key={u.id} type="button" className={u.id === userId ? 'chip on' : 'chip'} aria-pressed={u.id === userId}
                onClick={() => { setUserId(u.id); setErr('') }}>
                <strong>{u.name}</strong><span>{u.role === 'owner' ? t('role.owner') : t('role.tech')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="fld">
        <label className="lbl" htmlFor="pin">
          {session.users.length === 1 ? t('login.pinWithUser', { name: session.users[0]!.name }) : t('login.pin')}
        </label>
        <div className={err ? 'box err' : 'box'} dir="ltr">
          <input ref={input} id="pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin}
            aria-invalid={!!err} aria-describedby={err ? 'pinE' : undefined} onChange={(e) => { setPin(e.target.value); setErr('') }} />
        </div>
        {err && <span id="pinE" className="emsg" role="alert">{err}</span>}
      </div>
      <button type="submit" className="btn btn-p" disabled={busy || !pin}>{busy ? t('login.busy') : t('login.btn')}</button>
      <button type="button" className="lnk login-forgot" onClick={onForgot}>{t('login.forgot')}</button>
    </form>
  )
}

/** شاشة الدخول، بدون القائمة. */
export function Login({ session, network }: { session: SessionInfo; network: string }) {
  const { state, dispatch } = useStore()
  const [forgot, setForgot] = useState(false)
  const isEn = state.lang === 'en'
  const brandName = (network && network !== 'نقطة') ? network : (isEn ? 'Nuqta' : 'نقطة')

  return (
    <main className="login scr" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, right: isEn ? 16 : 'auto', left: isEn ? 'auto' : 16 }}>
        <button
          type="button"
          className="btn btn-g sm"
          style={{ fontWeight: 600, border: '1px solid var(--line)', background: '#fff' }}
          onClick={() => dispatch({ type: 'setLang', lang: isEn ? 'ar' : 'en' })}
          title={isEn ? 'التحويل إلى العربية' : 'Switch to English'}
        >
          {isEn ? 'عربي' : 'English'}
        </button>
      </div>
      <div className="login-brand">
        <Logo size={40} stroke="#13201D" />
        <strong>{brandName}</strong>
      </div>
      {session.needsOwnerPin ? <CreateOwnerPin /> : forgot ? <ResetPin onBack={() => setForgot(false)} /> : <PickAndPin session={session} onForgot={() => setForgot(true)} />}
    </main>
  )
}
