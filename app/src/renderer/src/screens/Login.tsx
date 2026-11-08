import { useEffect, useRef, useState } from 'react'
import type { SessionInfo } from '@shared/api'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { Logo } from '@/shell/icons'

export function authError(code: string, held?: number): string {
  switch (code) {
    case 'auth_pin_format': return 'الرمز من 4 لـ8 أرقام.'
    case 'auth_pin_wrong': return 'الرمز غلط.'
    case 'auth_locked': return `جرّبت كثير. استنى ${held ?? 30} ثانية وجرّب مرة ثانية.`
    case 'auth_inactive': return 'هذا المستخدم موقوف. صاحب الشبكة بيقدر يرجّعه.'
    case 'auth_not_found': return 'ما لقينا المستخدم.'
    case 'auth_owner_exists': return 'في رمز لصاحب الشبكة أصلا.'
    case 'auth_last_owner': return 'ما بتقدر توقف آخر مدير.'
    case 'auth_self': return 'ما بتقدر توقف حالك وانت داخل.'
    case 'reset_invalid': return 'المفتاح مش صحيح. تأكد إنك نسخته كامل.'
    case 'reset_other_device': return 'هذا المفتاح لجهاز ثاني.'
    case 'reset_wrong_request': return 'هذا المفتاح لطلب قديم. ابعت رمز الطلب الحالي للدعم.'
    case 'reset_expired': return 'هذا المفتاح انتهى. اطلب واحد جديد من الدعم.'
    default: return 'صار خطأ، جرّب مرة ثانية.'
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
      if (pin !== again) return setErr('الرمزين مش متطابقين.')
      setBusy(true)
      const r = await api.createOwnerPin(pin)
      setBusy(false)
      if (!r.ok) return setErr(authError(r.error.code))
      dispatch({ type: 'go', screen: 'home' })
      dispatch({ type: 'status', status: await api.status() })
    }}>
      <h1 className="h1">اعمل رمز لصاحب الشبكة</h1>
      <p className="sub" style={{ margin: 0 }}>الرمز بيحمي الحسابات. بتدخل فيه كل ما تفتح البرنامج، وبتقدر تضيف فني برمز ثاني من الإعدادات.</p>
      <div className="fld"><label className="lbl" htmlFor="op1">الرمز (4 لـ8 أرقام)</label><div className={err ? 'box err' : 'box'} dir="ltr"><input id="op1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} aria-invalid={!!err} aria-describedby={err ? 'opE' : undefined} onChange={(e) => { setPin(e.target.value); setErr('') }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="op2">اكتبه مرة ثانية</label><div className={err ? 'box err' : 'box'} dir="ltr"><input id="op2" type="password" inputMode="numeric" autoComplete="new-password" value={again} aria-invalid={!!err} onChange={(e) => { setAgain(e.target.value); setErr('') }} /></div></div>
      {err && <span id="opE" className="emsg" role="alert">{err}</span>}
      <button type="submit" className="btn btn-p" disabled={busy}>{busy ? 'جاري الحفظ' : 'احفظ وادخل'}</button>
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
  useEffect(() => { void api.pinResetRequest().then(setCodes, () => setErr('صار خطأ، جرّب مرة ثانية.')) }, [])
  const clear = () => setErr('')

  return (
    <form className="card login-card" onSubmit={async (e) => {
      e.preventDefault()
      if (!key.trim()) return setErr('الصق مفتاح الاسترجاع.')
      if (pin !== again) return setErr('الرمزين مش متطابقين.')
      setBusy(true)
      const r = await api.pinResetApply(key, pin)
      setBusy(false)
      if (!r.ok) return setErr(authError(r.error.code))
      dispatch({ type: 'go', screen: 'home' })
      dispatch({ type: 'status', status: await api.status() })
    }}>
      <h1 className="h1">نسيت الرمز</h1>
      <p className="sub" style={{ margin: 0 }}>هذا لصاحب الشبكة. ابعت الكودين للدعم، وبيبعتلك مفتاح لمرة وحدة. الفني بيطلب رمز جديد من صاحب الشبكة.</p>
      {codes && (
        <div className="reset-codes">
          <span className="lbl">كود الجهاز</span><code className="mono" dir="ltr">{codes.deviceCode}</code>
          <span className="lbl">رمز الطلب</span><code className="mono" dir="ltr">{codes.requestCode}</code>
          <button type="button" className="btn btn-s sm" onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${codes.deviceCode} ${codes.requestCode}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              setErr('ما قدرت أنسخ. اكتب الكودين بإيدك.')
            }
          }}>{copied ? 'انتسخوا' : 'انسخ الكودين'}</button>
        </div>
      )}
      <div className="fld"><label className="lbl" htmlFor="rk">مفتاح الاسترجاع</label><div className="box" dir="ltr"><input id="rk" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); clear() }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="rp1">الرمز الجديد (4 لـ8 أرقام)</label><div className="box" dir="ltr"><input id="rp1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => { setPin(e.target.value); clear() }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="rp2">اكتبه مرة ثانية</label><div className="box" dir="ltr"><input id="rp2" type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); clear() }} /></div></div>
      {err && <span className="emsg" role="alert">{err}</span>}
      <button type="submit" className="btn btn-p" disabled={busy}>{busy ? 'جاري الحفظ' : 'غيّر الرمز وادخل'}</button>
      <button type="button" className="btn btn-g" onClick={onBack}>رجوع</button>
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
      <h1 className="h1">ادخل</h1>
      {session.users.length > 1 && (
        <div className="fld">
          <span className="lbl" id="who">مين انت؟</span>
          <div role="group" aria-labelledby="who" className="login-users">
            {session.users.map((u) => (
              <button key={u.id} type="button" className={u.id === userId ? 'chip on' : 'chip'} aria-pressed={u.id === userId}
                onClick={() => { setUserId(u.id); setErr('') }}>
                <strong>{u.name}</strong><span>{u.role === 'owner' ? 'مدير' : 'فني'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="fld">
        <label className="lbl" htmlFor="pin">الرمز{session.users.length === 1 ? ` (${session.users[0]!.name})` : ''}</label>
        <div className={err ? 'box err' : 'box'} dir="ltr">
          <input ref={input} id="pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin}
            aria-invalid={!!err} aria-describedby={err ? 'pinE' : undefined} onChange={(e) => { setPin(e.target.value); setErr('') }} />
        </div>
        {err && <span id="pinE" className="emsg" role="alert">{err}</span>}
      </div>
      <button type="submit" className="btn btn-p" disabled={busy || !pin}>{busy ? 'جاري الدخول' : 'ادخل'}</button>
      <button type="button" className="lnk login-forgot" onClick={onForgot}>نسيت الرمز؟</button>
    </form>
  )
}

/** شاشة الدخول، بدون القائمة. */
export function Login({ session, network }: { session: SessionInfo; network: string }) {
  const [forgot, setForgot] = useState(false)
  return (
    <main className="login scr">
      <div className="login-brand"><Logo size={40} stroke="#13201D" /><strong>{network}</strong></div>
      {session.needsOwnerPin ? <CreateOwnerPin /> : forgot ? <ResetPin onBack={() => setForgot(false)} /> : <PickAndPin session={session} onForgot={() => setForgot(true)} />}
    </main>
  )
}
