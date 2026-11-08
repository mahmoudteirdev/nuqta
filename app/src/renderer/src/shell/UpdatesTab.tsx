import { useState } from 'react'
import type { UpdateView } from '@shared/api'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { useToast } from './Toast'

function useInstall() {
  const say = useToast()
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    const r = await api.installUpdate()
    if (!r.ok) {
      setBusy(false)
      say('ما قدرنا نثبّت التحديث. جرّب مرة ثانية.')
    }
  }
  return { busy, install }
}

/** شريط هادي لصاحب الشبكة لما نسخة تكون جاهزة. ما بيقطع الشغل. */
export function UpdateBanner() {
  const { state } = useStore()
  const { busy, install } = useInstall()
  const u = state.status?.update
  if (u?.state !== 'ready' || state.status?.session.user?.role !== 'owner') return null
  return (
    <div className="bn ok update-bn" role="status">
      <span><strong>في نسخة جديدة جاهزة</strong> <bdi dir="ltr">{u.version}</bdi>. بياناتك بتضل زي ما هي.</span>
      <button type="button" className="btn btn-s sm" disabled={busy} onClick={() => void install()}>{busy ? 'جاري التثبيت' : 'ثبّت وأعد التشغيل'}</button>
    </div>
  )
}

function line(u: UpdateView): { cls: string; text: string } {
  switch (u.state) {
    case 'off': return { cls: 'bn wa', text: 'التحديثات بتشتغل بالنسخة المثبتة بس.' }
    case 'checking': return { cls: 'bn', text: 'جاري الفحص.' }
    case 'downloading': return { cls: 'bn', text: `بننزل النسخة ${u.version ?? ''}: ${u.percent}%. بتقدر تكمل شغلك.` }
    case 'ready': return { cls: 'bn ok', text: `النسخة ${u.version ?? ''} جاهزة. بياناتك بتضل زي ما هي.` }
    case 'failed':
      return u.reason === 'signature'
        ? { cls: 'bn er', text: 'انرفض التحديث لأن توقيعه مش صحيح، وما انثبت شي. خبّر الدعم.' }
        : { cls: 'bn wa', text: 'ما قدرنا نفحص. تأكد من النت وجرّب مرة ثانية. البرنامج شغال عادي بدون تحديث.' }
    default: return { cls: 'bn ok', text: u.checkedAt ? 'عندك آخر نسخة.' : 'البرنامج بيفحص لحاله لما يكون في نت.' }
  }
}

export function UpdatesTab() {
  const { state, dispatch } = useStore()
  const { busy, install } = useInstall()
  const u = state.status?.update
  if (!u) return null
  const b = line(u)
  const working = u.state === 'checking' || u.state === 'downloading'
  return (
    <section className="card scr settings-form" aria-label="التحديثات">
      <div><span className="lbl">النسخة الحالية</span> <bdi dir="ltr" className="mono-in">{u.current}</bdi></div>
      <div className={b.cls} role="status"><span>{b.text}</span></div>
      {u.state === 'downloading' && <div className="bar" role="progressbar" aria-label="تنزيل التحديث" aria-valuenow={u.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${u.percent}%` }} /></div>}
      {u.state === 'ready'
        ? <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void install()}>{busy ? 'جاري التثبيت' : 'ثبّت وأعد التشغيل'}</button>
        : u.state !== 'off' && (
          <button type="button" className="btn btn-s" style={{ alignSelf: 'flex-start' }} disabled={working} onClick={async () => {
            await api.checkForUpdate()
            dispatch({ type: 'status', status: await api.status() })
          }}>افحص الآن</button>
        )}
      <p className="sub small" style={{ margin: 0 }}>البرنامج بينزل التحديث بالخلفية وما بيثبته إلا لما تضغط. وبياخد نسخة احتياطية قبل التثبيت.</p>
    </section>
  )
}
