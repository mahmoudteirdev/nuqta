import { useState } from 'react'
import type { ImportPreview } from '@shared/api'
import { api } from '@/lib/api'
import { errorText, useOpKey } from '@/lib/actions'
import { cardsText } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { useToast } from './Toast'

const DIRECT = 'direct'
const NONE = 'none'

function importError(code: string): string {
  switch (code) {
    case 'import_empty': return 'ما لقينا أكواد بالملف. لازم يكون فيه عمود للكود، مثل name أو username أو الكود.'
    case 'import_expired': return 'المعاينة قديمة. اختر الملف مرة ثانية.'
    case 'import_no_router': return 'اربط الراوتر أول، عشان نعرف وين الكروت.'
    default: return errorText({ code })
  }
}

/** استيراد من برنامج ثاني: معاينة أول، وبعدين تسجيل (HANDOFF القسم 7). */
export function ImportTab() {
  const { dispatch } = useStore()
  const say = useToast()
  const op = useOpKey()
  const form = useApi(() => api.batchForm())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [dist, setDist] = useState(DIRECT)
  const [fallback, setFallback] = useState(NONE)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const cats = form.state === 'ready' ? form.data.categories : []
  const dists = form.state === 'ready' ? form.data.distributors : []
  const unknown = preview?.groups.filter((g) => g.categoryId === null) ?? []
  const unknownCount = unknown.reduce((a, g) => a + g.count, 0)
  const willImport = preview ? preview.fresh - (fallback === NONE ? unknownCount : 0) : 0

  return (
    <section className="card scr settings-form" aria-label="الاستيراد">
      <div>
        <h2 className="h2">استيراد من برنامج ثاني</h2>
        <span className="sub">صدّر الكروت من برنامجك الحالي كملف CSV، ورح نربطها بالموزعين.</span>
      </div>
      <span className="sub small">الملف لازم يكون فيه عمود للكود (name أو username أو الكود)، وممكن الفئة (profile) والاستخدام (uptime).</span>
      <button type="button" className={preview ? 'btn btn-s' : 'btn btn-p'} style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
        setErr('')
        setBusy(true)
        const r = await api.importPreview()
        setBusy(false)
        if (!r.ok) return setErr(importError(r.error.code))
        if ('cancelled' in r.value) return
        setPreview(r.value)
        op.renew()
      }}>
        {busy && !preview && <span className="spin" aria-hidden="true" />}
        {busy && !preview ? 'جاري القراءة' : preview ? 'اختر ملف ثاني' : 'اختر ملف CSV'}
      </button>
      {err && <div className="bn er" role="alert"><span>{err}</span></div>}

      {preview && (
        <>
          <div className="bn ok" role="status">
            <span>
              <strong>لقينا {cardsText(preview.total)} في <bdi dir="ltr">{preview.fileName}</bdi>.</strong>{' '}
              {preview.fresh === 0 ? 'كلهم موجودين عندنا، فما في شي جديد. ' : <>
                {preview.duplicates === 1 && 'واحد منهم مكرر ورح نتجاوزه. '}
                {preview.duplicates > 1 && `${preview.duplicates} منهم مكررين ورح نتجاوزهم. `}
              </>}
              {preview.invalid === 1 && 'وسطر واحد ما فيه كود مقروء.'}
              {preview.invalid > 1 && `و${preview.invalid} أسطر ما فيها كود مقروء.`}
            </span>
          </div>

          <div className="import-groups">
            {preview.groups.map((g) => (
              <div key={g.profile ?? '-'} className="restore-row">
                <span><strong>{g.categoryName ?? (g.profile ? `فئة ${g.profile}` : 'بدون فئة')}</strong>{g.categoryId === null && <span className="warn-text"> (مش معروفة عندنا)</span>}</span>
                <span className="sub">{cardsText(g.count)}{g.used ? `، منهم ${g.used} مستخدم` : ''}</span>
              </div>
            ))}
          </div>

          {preview.fresh > 0 && unknownCount > 0 && (
            <div className="fld">
              <label className="lbl" htmlFor="ifb">{cardsText(unknownCount)} فئتها مش معروفة. سجلها كـ</label>
              <div className="box"><select id="ifb" value={fallback} onChange={(e) => setFallback(e.target.value)}>
                <option value={NONE}>ما تستوردها</option>
                {cats.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select></div>
            </div>
          )}

          {preview.fresh > 0 && <div className="fld">
            <label className="lbl" htmlFor="idist">الكروت عند مين؟</label>
            <div className="box"><select id="idist" value={dist} onChange={(e) => setDist(e.target.value)}>
              <option value={DIRECT}>بيع مباشر (لحين ربطها بموزع)</option>
              {dists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
            <span className="sub small">الكروت المستخدمة قبل ما بتنحسب دين. غير المستخدمة بتصير عهدة عند الموزع، ودينها حسب سياسته.</span>
          </div>}

          {willImport > 0 && <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
            setBusy(true)
            const r = await api.importCommit(preview.token, { distributorId: dist === DIRECT ? null : dist, fallbackCategoryId: fallback === NONE ? null : Number(fallback) }, op.key())
            setBusy(false)
            if (!r.ok) return setErr(importError(r.error.code))
            op.renew()
            const name = dists.find((d) => d.id === dist)?.name
            say(name ? `انضاف ${cardsText(r.value.imported)} على ${name}.` : t('toast.import', { n: r.value.imported }))
            setPreview(null)
            dispatch({ type: 'changed' })
          }}>
            {busy && <span className="spin" aria-hidden="true" />}
            {busy ? 'جاري الاستيراد' : `استورد ${cardsText(willImport)}`}
          </button>}
        </>
      )}
    </section>
  )
}
