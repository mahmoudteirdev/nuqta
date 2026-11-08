import { useState } from 'react'
import type { LicenseInfo } from '@shared/api'
import { api } from '@/lib/api'
import { daysText } from '@/lib/format'
import { getLang, t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useToast } from './Toast'

export function licenseBanner(l: LicenseInfo, isEn = getLang() === 'en'): { cls: string; title: string; text: string } {
  if (l.state === 'licensed') {
    const dateStr = l.expires ? new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(l.expires)) : ''
    return {
      cls: 'bn ok',
      title: isEn ? 'Application is activated.' : 'البرنامج مفعل.',
      text: l.expires
        ? (isEn ? `On this device, until ${dateStr}.` : `على هذا الجهاز، لحد ${dateStr}.`)
        : (isEn ? 'On this device.' : 'على هذا الجهاز.')
    }
  }
  if (l.state === 'trial') {
    return {
      cls: 'bn wa',
      title: isEn ? 'Trial version.' : 'نسخة تجريبية.',
      text: isEn ? `${daysText(l.daysLeft, 'en')} remaining. Full features available during trial.` : `باقي ${daysText(l.daysLeft, 'ar')}. البرنامج بيشتغل كامل خلال التجربة.`
    }
  }
  return {
    cls: 'bn er',
    title: isEn ? 'Trial expired.' : 'انتهت التجربة.',
    text: isEn ? 'Accounts, reports, and backups remain active. Generating new cards requires license activation.' : 'الحسابات والتقارير والنسخ شغالة عادي، بس توليد كروت جديدة بده تفعيل.'
  }
}

function licenseError(code: string, isEn = getLang() === 'en'): string {
  switch (code) {
    case 'license_empty': return t('err.licenseEmpty')
    case 'license_invalid': return isEn ? 'Invalid license key. Make sure you copied it completely.' : 'المفتاح مش صحيح. تأكد إنك نسخته كامل.'
    case 'license_other_device': return isEn ? 'This key is for a different device. Send this device code to support.' : 'هذا المفتاح لجهاز ثاني. ابعت كود هالجهاز للدعم.'
    case 'license_expired': return isEn ? 'This license key has expired.' : 'هذا المفتاح منتهي.'
    default: return isEn ? 'An error occurred, please try again.' : 'صار خطأ، جرّب مرة ثانية.'
  }
}

export function LicenseTab() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const lic = state.status?.license
  if (!lic) return null
  const b = licenseBanner(lic, isEn)

  return (
    <section className="card scr settings-form" aria-label={isEn ? 'License' : 'الترخيص'}>
      <div className={b.cls} role="status"><span><strong>{b.title}</strong> {b.text}</span></div>
      <div className="fld">
        <label className="lbl" htmlFor="lk">{isEn ? 'License Key' : 'مفتاح الترخيص'}</label>
        <div className={err ? 'box err area' : 'box area'}>
          <textarea id="lk" dir="ltr" rows={3} value={key} placeholder="XXXXX-XXXXX-XXXXX…" aria-invalid={!!err} aria-describedby={err ? 'lkE' : undefined}
            onChange={(e) => { setKey(e.target.value); setErr('') }} />
        </div>
        {err && <span id="lkE" className="emsg" role="alert">{err}</span>}
      </div>
      <div className="device-code">
        {isEn ? 'No Internet? Send device code ' : 'بدون نت؟ ابعت كود الجهاز '}
        <bdi dir="ltr" className="mono-in">{lic.deviceCode}</bdi>
        {isEn ? ' to support to receive an activation key.' : ' للدعم، وبيوصلك مفتاح تفعيل.'}
        <button type="button" className="btn btn-g sm lnk-btn" onClick={async () => {
          try {
            await navigator.clipboard.writeText(lic.deviceCode)
            say(isEn ? 'Device code copied.' : 'انسخ كود الجهاز.')
          } catch {
            say(isEn ? 'Could not copy. Please write code manually.' : 'ما قدرنا ننسخ. اكتب الكود بإيدك.')
          }
        }}>{isEn ? 'Copy Code' : 'انسخ الكود'}</button>
      </div>
      <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
        setBusy(true)
        const r = await api.activateLicense(key)
        setBusy(false)
        if (!r.ok) return setErr(licenseError(r.error.code, isEn))
        setKey('')
        say(isEn ? 'License activated successfully.' : 'تم التفعيل.')
        dispatch({ type: 'status', status: await api.status() })
      }}>
        {busy && <span className="spin" aria-hidden="true" />}
        {busy ? (isEn ? 'Activating...' : 'جاري التفعيل') : (isEn ? 'Activate' : 'فعّل')}
      </button>
    </section>
  )
}
