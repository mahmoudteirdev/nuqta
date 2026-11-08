import { useState } from 'react'
import type { UserRole, UserRow } from '@shared/api'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { authError } from '@/screens/Login'
import { Dialog } from './Dialog'
import { useToast } from './Toast'

function getRoleDefs(isEn: boolean): Record<UserRole, { name: string; note: string }> {
  return {
    owner: { name: isEn ? 'Owner' : 'مدير', note: isEn ? 'Full permissions' : 'كل الصلاحيات' },
    technician: { name: isEn ? 'Technician' : 'فني', note: isEn ? 'Cards, network & check; no financial records' : 'الكروت والشبكة وفحص الكرت، بدون الحسابات' }
  }
}

function getLockOptions(isEn: boolean) {
  return [
    { v: 5, t: isEn ? '5 minutes' : '5 دقائق' },
    { v: 15, t: isEn ? '15 minutes' : '15 دقيقة' },
    { v: 30, t: isEn ? '30 minutes' : '30 دقيقة' },
    { v: 60, t: isEn ? '1 hour' : 'ساعة' },
    { v: 0, t: isEn ? 'Never' : 'ما يقفل' }
  ]
}

function PinFields({ pin, again, setPin, setAgain, isEn }: { pin: string; again: string; setPin: (v: string) => void; setAgain: (v: string) => void; isEn: boolean }) {
  return (
    <>
      <div className="fld"><label className="lbl" htmlFor="np1">{isEn ? 'PIN (4 to 8 digits)' : 'الرمز (4 لـ8 أرقام)'}</label><div className="box" dir="ltr"><input id="np1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="np2">{isEn ? 'Re-enter PIN' : 'اكتبه مرة ثانية'}</label><div className="box" dir="ltr"><input id="np2" type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div></div>
    </>
  )
}

export function UsersTab() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [n, setN] = useState(0)
  const list = useApi(() => api.users(), [n])
  const users = list.state === 'ready' ? list.data : []
  const me = state.status?.session.user

  const roles = getRoleDefs(isEn)
  const lockOptions = getLockOptions(isEn)

  const msg = (code: string) => (code.startsWith('auth_') ? authError(code) : code === 'pin_format' ? authError('auth_pin_format') : code === 'user_exists' ? (isEn ? 'User with this name already exists.' : 'في مستخدم بنفس الاسم.') : errorText({ code }))

  const [dlg, setDlg] = useState<{ kind: 'add' } | { kind: 'pin'; user: UserRow } | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('technician')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const open = (d: NonNullable<typeof dlg>) => { setDlg(d); setName(''); setRole('technician'); setPin(''); setAgain(''); setErr('') }

  return (
    <section className="panel scr" aria-label={isEn ? 'Users' : 'المستخدمون'}>
      <div className="panel-head">
        <div>
          <h2 className="h2">{isEn ? 'Users & Permissions' : 'المستخدمون والصلاحيات'}</h2>
          <span className="sub small">{isEn ? 'Each user logs in with their own PIN; actions are logged. Technicians manage cards & network without account access.' : 'كل واحد بيدخل برمزه، والدفتر بيسجل مين عمل كل حركة. الفني بيدير الكروت والشبكة، وما بيشوف الحسابات.'}</span>
        </div>
        <button type="button" className="btn btn-s sm" onClick={() => open({ kind: 'add' })}>{isEn ? '+ Add User' : 'أضف مستخدم'}</button>
      </div>
      {users.map((u) => (
        <div key={u.id} className="rowx" style={{ gridTemplateColumns: '1.2fr .6fr 1.4fr auto' }}>
          <strong>{u.name}{u.id === me?.id && <span className="sub small">{isEn ? ' (you)' : ' (انت)'}</span>}</strong>
          <span>{roles[u.role].name}</span>
          <span className="sub">{!u.active ? (isEn ? 'Suspended' : 'موقوف') : !u.hasPin ? (isEn ? 'No PIN, cannot log in' : 'بدون رمز، ما بيقدر يدخل') : roles[u.role].note}</span>
          <span className="row-btns">
            <button type="button" className="btn btn-s sm" onClick={() => open({ kind: 'pin', user: u })}>{isEn ? 'Change PIN' : 'غيّر الرمز'}</button>
            {u.id !== me?.id && (
              <button type="button" className={u.active ? 'btn btn-d sm' : 'btn btn-s sm'} onClick={async () => {
                const r = await api.setUserActive(u.id, !u.active)
                if (!r.ok) return say(msg(r.error.code))
                say(u.active ? (isEn ? `Suspended ${u.name}.` : `انوقف ${u.name}.`) : (isEn ? `Reactivated ${u.name}.` : `رجع ${u.name}.`))
                setN((x) => x + 1)
              }}>{u.active ? (isEn ? 'Suspend' : 'أوقفه') : (isEn ? 'Activate' : 'رجّعه')}</button>
            )}
          </span>
        </div>
      ))}

      <div className="pad fld">
        <label className="lbl" htmlFor="lockm">{isEn ? 'Auto-lock when idle' : 'قفل البرنامج إذا ما في حركة'}</label>
        <div className="box" style={{ maxWidth: 240 }}>
          <select id="lockm" value={String(state.status?.session.lockAfterMinutes ?? 15)} onChange={async (e) => {
            const r = await api.setLockAfter(Number(e.target.value))
            if (!r.ok) return say(errorText(r.error))
            dispatch({ type: 'status', status: await api.status() })
          }}>
            {lockOptions.map((o) => <option key={o.v} value={String(o.v)}>{o.t}</option>)}
          </select>
        </div>
      </div>

      {dlg && (
        <Dialog title={dlg.kind === 'add' ? (isEn ? 'Add User' : 'أضف مستخدم') : (isEn ? `New PIN for ${dlg.user.name}` : `رمز جديد لـ${dlg.user.name}`)}
          okLabel={dlg.kind === 'add' ? (isEn ? 'Add' : 'أضف') : t('common.save')} busy={busy} error={err}
          onCancel={() => setDlg(null)}
          onOk={async () => {
            if (dlg.kind === 'add' && !name.trim()) return setErr(t('err.userName'))
            if (pin !== again) return setErr(t('login.err.mismatch'))
            setBusy(true)
            const r = dlg.kind === 'add' ? await api.addUser({ name, role, pin }) : await api.setUserPin(dlg.user.id, pin)
            setBusy(false)
            if (!r.ok) return setErr(msg(r.error.code))
            setDlg(null)
            say(dlg.kind === 'add' ? (isEn ? `Added ${name.trim()}.` : `انضاف ${name.trim()}.`) : (isEn ? 'New PIN saved.' : 'انحفظ الرمز الجديد.'))
            setN((x) => x + 1)
          }}>
          {dlg.kind === 'add' && (
            <>
              <div className="fld"><label className="lbl" htmlFor="un">{isEn ? 'Name' : 'الاسم'}</label><div className="box"><input id="un" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} /></div></div>
              <div className="fld">
                <span className="lbl" id="ur">{isEn ? 'Role' : 'الدور'}</span>
                <div role="group" aria-labelledby="ur" className="tpl-list">
                  {(Object.keys(roles) as UserRole[]).map((k) => (
                    <button key={k} type="button" className={role === k ? 'chip on' : 'chip'} aria-pressed={role === k} style={{ minHeight: 56 }} onClick={() => setRole(k)}>
                      <strong>{roles[k].name}</strong><span>{roles[k].note}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <PinFields pin={pin} again={again} setPin={(v) => { setPin(v); setErr('') }} setAgain={(v) => { setAgain(v); setErr('') }} isEn={isEn} />
        </Dialog>
      )}
    </section>
  )
}
