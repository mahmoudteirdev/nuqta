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

const ROLE: Record<UserRole, { name: string; note: string }> = {
  owner: { name: 'مدير', note: 'كل الصلاحيات' },
  technician: { name: 'فني', note: 'الكروت والشبكة وفحص الكرت، بدون الحسابات' }
}

const LOCK = [{ v: 5, t: '5 دقائق' }, { v: 15, t: '15 دقيقة' }, { v: 30, t: '30 دقيقة' }, { v: 60, t: 'ساعة' }, { v: 0, t: 'ما يقفل' }]

const msg = (code: string) => (code.startsWith('auth_') ? authError(code) : code === 'pin_format' ? authError('auth_pin_format') : code === 'user_exists' ? 'في مستخدم بنفس الاسم.' : errorText({ code }))

function PinFields({ pin, again, setPin, setAgain }: { pin: string; again: string; setPin: (v: string) => void; setAgain: (v: string) => void }) {
  return (
    <>
      <div className="fld"><label className="lbl" htmlFor="np1">الرمز (4 لـ8 أرقام)</label><div className="box" dir="ltr"><input id="np1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="np2">اكتبه مرة ثانية</label><div className="box" dir="ltr"><input id="np2" type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div></div>
    </>
  )
}

export function UsersTab() {
  const { state, dispatch } = useStore()
  const say = useToast()
  const [n, setN] = useState(0)
  const list = useApi(() => api.users(), [n])
  const users = list.state === 'ready' ? list.data : []
  const me = state.status?.session.user

  const [dlg, setDlg] = useState<{ kind: 'add' } | { kind: 'pin'; user: UserRow } | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('technician')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const open = (d: NonNullable<typeof dlg>) => { setDlg(d); setName(''); setRole('technician'); setPin(''); setAgain(''); setErr('') }

  return (
    <section className="panel scr" aria-label="المستخدمون">
      <div className="panel-head">
        <div>
          <h2 className="h2">المستخدمون والصلاحيات</h2>
          <span className="sub small">كل واحد بيدخل برمزه، والدفتر بيسجل مين عمل كل حركة. الفني بيدير الكروت والشبكة، وما بيشوف الحسابات.</span>
        </div>
        <button type="button" className="btn btn-s sm" onClick={() => open({ kind: 'add' })}>أضف مستخدم</button>
      </div>
      {users.map((u) => (
        <div key={u.id} className="rowx" style={{ gridTemplateColumns: '1.2fr .6fr 1.4fr auto' }}>
          <strong>{u.name}{u.id === me?.id && <span className="sub small"> (انت)</span>}</strong>
          <span>{ROLE[u.role].name}</span>
          <span className="sub">{!u.active ? 'موقوف' : !u.hasPin ? 'بدون رمز، ما بيقدر يدخل' : ROLE[u.role].note}</span>
          <span className="row-btns">
            <button type="button" className="btn btn-s sm" onClick={() => open({ kind: 'pin', user: u })}>غيّر الرمز</button>
            {u.id !== me?.id && (
              <button type="button" className={u.active ? 'btn btn-d sm' : 'btn btn-s sm'} onClick={async () => {
                const r = await api.setUserActive(u.id, !u.active)
                if (!r.ok) return say(msg(r.error.code))
                say(u.active ? `انوقف ${u.name}.` : `رجع ${u.name}.`)
                setN((x) => x + 1)
              }}>{u.active ? 'أوقفه' : 'رجّعه'}</button>
            )}
          </span>
        </div>
      ))}

      <div className="pad fld">
        <label className="lbl" htmlFor="lockm">قفل البرنامج إذا ما في حركة</label>
        <div className="box" style={{ maxWidth: 240 }}>
          <select id="lockm" value={String(state.status?.session.lockAfterMinutes ?? 15)} onChange={async (e) => {
            const r = await api.setLockAfter(Number(e.target.value))
            if (!r.ok) return say(errorText(r.error))
            dispatch({ type: 'status', status: await api.status() })
          }}>
            {LOCK.map((o) => <option key={o.v} value={String(o.v)}>{o.t}</option>)}
          </select>
        </div>
      </div>

      {dlg && (
        <Dialog title={dlg.kind === 'add' ? 'أضف مستخدم' : `رمز جديد لـ${dlg.user.name}`} okLabel={dlg.kind === 'add' ? 'أضف' : 'احفظ'} busy={busy} error={err}
          onCancel={() => setDlg(null)}
          onOk={async () => {
            if (dlg.kind === 'add' && !name.trim()) return setErr(t('err.userName'))
            if (pin !== again) return setErr('الرمزين مش متطابقين.')
            setBusy(true)
            const r = dlg.kind === 'add' ? await api.addUser({ name, role, pin }) : await api.setUserPin(dlg.user.id, pin)
            setBusy(false)
            if (!r.ok) return setErr(msg(r.error.code))
            setDlg(null)
            say(dlg.kind === 'add' ? `انضاف ${name.trim()}.` : 'انحفظ الرمز الجديد.')
            setN((x) => x + 1)
          }}>
          {dlg.kind === 'add' && (
            <>
              <div className="fld"><label className="lbl" htmlFor="un">الاسم</label><div className="box"><input id="un" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} /></div></div>
              <div className="fld">
                <span className="lbl" id="ur">الدور</span>
                <div role="group" aria-labelledby="ur" className="tpl-list">
                  {(Object.keys(ROLE) as UserRole[]).map((k) => (
                    <button key={k} type="button" className={role === k ? 'chip on' : 'chip'} aria-pressed={role === k} style={{ minHeight: 56 }} onClick={() => setRole(k)}>
                      <strong>{ROLE[k].name}</strong><span>{ROLE[k].note}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <PinFields pin={pin} again={again} setPin={(v) => { setPin(v); setErr('') }} setAgain={(v) => { setAgain(v); setErr('') }} />
        </Dialog>
      )}
    </section>
  )
}
