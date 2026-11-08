import { useState } from 'react'
import type { UpdateView } from '@shared/api'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { useToast } from './Toast'

function useInstall() {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    const r = await api.installUpdate()
    if (!r.ok) {
      setBusy(false)
      say(isEn ? 'Unable to install update. Please try again.' : 'ما قدرنا نثبّت التحديث. جرّب مرة ثانية.')
    }
  }
  return { busy, install }
}

/** شريط هادي لصاحب الشبكة لما نسخة تكون جاهزة. */
export function UpdateBanner() {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const { busy, install } = useInstall()
  const u = state.status?.update
  if (u?.state !== 'ready' || state.status?.session.user?.role !== 'owner') return null
  return (
    <div className="bn ok update-bn" role="status">
      <span><strong>{isEn ? 'New version ready ' : 'في نسخة جديدة جاهزة '}</strong> <bdi dir="ltr">{u.version}</bdi>. {isEn ? 'Your data remains safe.' : 'بياناتك بتضل زي ما هي.'}</span>
      <button type="button" className="btn btn-s sm" disabled={busy} onClick={() => void install()}>
        {busy ? (isEn ? 'Installing...' : 'جاري التثبيت') : (isEn ? 'Install & Restart' : 'ثبّت وأعد التشغيل')}
      </button>
    </div>
  )
}

function line(u: UpdateView, isEn: boolean): { cls: string; text: string } {
  if (isEn) {
    switch (u.state) {
      case 'off': return { cls: 'bn wa', text: 'Updates are active in installed production mode only.' }
      case 'checking': return { cls: 'bn', text: 'Checking for updates...' }
      case 'downloading': return { cls: 'bn', text: `Downloading version ${u.version ?? ''}: ${u.percent}%. You can keep working.` }
      case 'ready': return { cls: 'bn ok', text: `Version ${u.version ?? ''} is ready. Your data remains safe.` }
      case 'failed':
        return u.reason === 'signature'
          ? { cls: 'bn er', text: 'Update rejected due to invalid digital signature; nothing was installed. Contact support.' }
          : { cls: 'bn wa', text: 'Unable to check for updates. Check internet and try again. App continues normally.' }
      default: return { cls: 'bn ok', text: u.checkedAt ? 'You have the latest version.' : 'App checks for updates automatically when connected.' }
    }
  }
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
  const isEn = state.lang === 'en'
  const { busy, install } = useInstall()
  const u = state.status?.update
  if (!u) return null
  const b = line(u, isEn)
  const working = u.state === 'checking' || u.state === 'downloading'
  return (
    <section className="card scr settings-form" aria-label={isEn ? 'Updates' : 'التحديثات'}>
      <div><span className="lbl">{isEn ? 'Current Version' : 'النسخة الحالية'}</span> <bdi dir="ltr" className="mono-in">{u.current}</bdi></div>
      <div className={b.cls} role="status"><span>{b.text}</span></div>
      {u.state === 'downloading' && <div className="bar" role="progressbar" aria-label={isEn ? 'Downloading update' : 'تنزيل التحديث'} aria-valuenow={u.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${u.percent}%` }} /></div>}
      {u.state === 'ready'
        ? <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void install()}>{busy ? (isEn ? 'Installing...' : 'جاري التثبيت') : (isEn ? 'Install & Restart' : 'ثبّت وأعد التشغيل')}</button>
        : u.state !== 'off' && (
          <button type="button" className="btn btn-s" style={{ alignSelf: 'flex-start' }} disabled={working} onClick={async () => {
            await api.checkForUpdate()
            dispatch({ type: 'status', status: await api.status() })
          }}>{isEn ? 'Check Now' : 'افحص الآن'}</button>
        )}
      <p className="sub small" style={{ margin: 0 }}>{isEn ? 'Updates are downloaded quietly in the background and only installed with your confirmation. A backup is taken automatically.' : 'البرنامج بينزل التحديث بالخلفية وما بيثبته إلا لما تضغط. وبياخد نسخة احتياطية قبل التثبيت.'}</p>
    </section>
  )
}
