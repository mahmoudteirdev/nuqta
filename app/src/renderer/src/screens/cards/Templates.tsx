import { useEffect, useState } from 'react'
import type { PrintTemplate, TemplateSettings } from '@shared/api'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { formatMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { useToast } from '@/shell/Toast'
import { TEMPLATE_INFO, Voucher } from '@/shell/Voucher'

/** شكل الكرت المطبوع. الطباعة نفسها بالخطوة 6؛ هون الإعدادات والمعاينة. */
export function Templates() {
  const { dispatch } = useStore()
  const say = useToast()
  const saved = useApi(() => api.templateSettings())
  const cats = useApi(() => api.categories())
  const [s, setS] = useState<TemplateSettings | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (saved.state === 'ready' && !s) setS(saved.data) }, [saved, s])

  if (!s) return <div className="card"><span className="sk" style={{ width: '50%' }} /></div>
  const sample = cats.state === 'ready' ? (cats.data.find((c) => c.name === '3 ساعات') ?? cats.data[0]) : undefined

  return (
    <div className="scr tpl">
      <section className="card tpl-form" aria-label="إعدادات القالب">
        <div className="fld">
          <span className="lbl" id="tl">شكل الطباعة</span>
          <div role="group" aria-labelledby="tl" className="tpl-list">
            {(Object.keys(TEMPLATE_INFO) as PrintTemplate[]).map((k) => (
              <button key={k} type="button" className={s.template === k ? 'chip on' : 'chip'} aria-pressed={s.template === k}
                style={{ minHeight: 56 }} onClick={() => setS((p) => p && { ...p, template: k })}>
                <strong>{TEMPLATE_INFO[k].name}</strong>
                <span>{TEMPLATE_INFO[k].note}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="fld">
          <label className="lbl" htmlFor="tn">اسم الشبكة</label>
          <div className={err ? 'box err' : 'box'}>
            <input id="tn" value={s.networkName} aria-invalid={!!err} aria-describedby={err ? 'tnE' : undefined}
              onChange={(e) => { const v = e.target.value; setS((p) => p && { ...p, networkName: v }); setErr('') }} />
          </div>
          {err && <span id="tnE" className="emsg" role="alert">{err}</span>}
        </div>
        <label className="check">
          <input type="checkbox" checked={s.showPrice} onChange={(e) => { const v = e.target.checked; setS((p) => p && { ...p, showPrice: v }) }} />
          اطبع السعر على الكرت
        </label>
        <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy}
          onClick={async () => {
            if (!s.networkName.trim()) return setErr('اكتب اسم الشبكة.')
            setBusy(true)
            const r = await api.saveTemplateSettings(s)
            setBusy(false)
            if (!r.ok) return setErr(errorText(r.error))
            say('انحفظ القالب.')
            dispatch({ type: 'status', status: await api.status() })
            dispatch({ type: 'changed' })
          }}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? 'جاري الحفظ' : 'احفظ القالب'}
        </button>
      </section>
      <section className="card tpl-preview" aria-label="معاينة القالب">
        <h2 className="h2">معاينة</h2>
        <div className={`tpl-sample tpl-${s.template}`}>
          <Voucher large hint network={s.networkName} category={sample?.name ?? '3 ساعات'} code="A7HK-58RX"
            foot={s.showPrice && sample ? formatMoney(sample.saleAg) : ''} phone={s.phone} />
        </div>
        <span className="sub small">{TEMPLATE_INFO[s.template].page}. الأكواد ما بتستخدم 0 و O و 1 و I و L.</span>
      </section>
    </div>
  )
}
