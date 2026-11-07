import { useState } from 'react'
import type { LicenseInfo } from '@shared/api'
import { api } from '@/lib/api'
import { daysText } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useToast } from './Toast'

const date = (d: string) => new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d))

export function licenseBanner(l: LicenseInfo): { cls: string; title: string; text: string } {
  if (l.state === 'licensed') return { cls: 'bn ok', title: 'البرنامج مفعل.', text: l.expires ? `على هذا الجهاز، لحد ${date(l.expires)}.` : 'على هذا الجهاز.' }
  if (l.state === 'trial') return { cls: 'bn wa', title: 'نسخة تجريبية.', text: `باقي ${daysText(l.daysLeft)}. البرنامج بيشتغل كامل خلال التجربة.` }
  return { cls: 'bn er', title: 'انتهت التجربة.', text: 'الحسابات والتقارير والنسخ شغالة عادي، بس توليد كروت جديدة بده تفعيل.' }
}

function licenseError(code: string): string {
  switch (code) {
    case 'license_empty': return t('err.licenseEmpty')
    case 'license_invalid': return 'المفتاح مش صحيح. تأكد إنك نسخته كامل.'
    case 'license_other_device': return 'هذا المفتاح لجهاز ثاني. ابعت كود هالجهاز للدعم.'
    case 'license_expired': return 'هذا المفتاح منتهي.'
    default: return 'صار خطأ، جرّب مرة ثانية.'
  }
}

export function LicenseTab() {
  const { state, dispatch } = useStore()
  const say = useToast()
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const lic = state.status?.license
  if (!lic) return null
  const b = licenseBanner(lic)

  return (
    <section className="card scr settings-form" aria-label="الترخيص">
      <div className={b.cls} role="status"><span><strong>{b.title}</strong> {b.text}</span></div>
      <div className="fld">
        <label className="lbl" htmlFor="lk">مفتاح الترخيص</label>
        <div className={err ? 'box err area' : 'box area'}>
          <textarea id="lk" dir="ltr" rows={3} value={key} placeholder="XXXXX-XXXXX-XXXXX…" aria-invalid={!!err} aria-describedby={err ? 'lkE' : undefined}
            onChange={(e) => { setKey(e.target.value); setErr('') }} />
        </div>
        {err && <span id="lkE" className="emsg" role="alert">{err}</span>}
      </div>
      <div className="device-code">
        بدون نت؟ ابعت كود الجهاز <bdi dir="ltr" className="mono-in">{lic.deviceCode}</bdi> للدعم، وبيوصلك مفتاح تفعيل.
        <button type="button" className="btn btn-g sm lnk-btn" onClick={async () => {
          try {
            await navigator.clipboard.writeText(lic.deviceCode)
            say('انسخ كود الجهاز.')
          } catch {
            say('ما قدرنا ننسخ. اكتب الكود بإيدك.')
          }
        }}>انسخ الكود</button>
      </div>
      <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
        setBusy(true)
        const r = await api.activateLicense(key)
        setBusy(false)
        if (!r.ok) return setErr(licenseError(r.error.code))
        setKey('')
        say('تم التفعيل.')
        dispatch({ type: 'status', status: await api.status() })
      }}>
        {busy && <span className="spin" aria-hidden="true" />}
        {busy ? 'جاري التفعيل' : 'فعّل'}
      </button>
    </section>
  )
}
