import { useEffect, useState } from 'react'
import type { CategoryRow } from '@shared/api'
import { parseAgorot } from '@shared/input'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { formatMoney } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from '@/shell/Dialog'
import { useToast } from '@/shell/Toast'

const COLS = { gridTemplateColumns: '1.2fr 1fr 1fr 1fr 120px', alignItems: 'center' }
const plain = (ag: number) => (ag % 100 ? (ag / 100).toFixed(2) : String(ag / 100))

/** صف فئة. السعر بينحفظ لما تطلع من الحقل أو تضغط Enter، وبيأثر على الدفعات الجاية بس. */
function PriceRow({ c }: { c: CategoryRow }) {
  const say = useToast()
  const { state, dispatch } = useStore()
  const [whole, setWhole] = useState(plain(c.wholeAg))
  const [sale, setSale] = useState(plain(c.saleAg))
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [delBusy, setDelBusy] = useState(false)

  useEffect(() => { setWhole(plain(c.wholeAg)); setSale(plain(c.saleAg)) }, [c.wholeAg, c.saleAg])

  const w = parseAgorot(whole)
  const s = parseAgorot(sale)
  const margin = Number.isNaN(w) || Number.isNaN(s) ? null : s - w

  const save = async () => {
    if (w === c.wholeAg && s === c.saleAg) return setErr('')
    if (!(w > 0) || !(s > 0)) return setErr(t('err.amountDialog'))
    const r = await api.setCategoryPrices(c.id, w, s)
    if (!r.ok) return setErr(errorText(r.error))
    setErr('')
    say(state.lang === 'en' ? `Saved prices for ${c.name}. Existing batches remain unchanged.` : `انحفظ سعر ${c.name}. الدفعات القديمة ما بتتغير.`)
    dispatch({ type: 'changed' })
  }
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }
  const errId = `pe-${c.id}`

  return (
    <>
      <div role="row" className="rowx" style={COLS}>
        <div role="cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <strong>{c.name}</strong>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className="sub small" style={{ fontSize: '11px', opacity: 0.7 }}>{c.routerProfile}</span>
            {c.hotspotServer && (
              <span className="bn ok sm" style={{ fontSize: '10px', padding: '1px 5px' }}>{c.hotspotServer}</span>
            )}
          </div>
        </div>
        <span role="cell" style={{ display: 'contents' }}>
          <div className={err ? 'box err' : 'box'} dir="ltr"><span aria-hidden="true">₪</span>
            <input aria-label={`سعر جملة ${c.name}`} inputMode="decimal" value={whole} aria-invalid={!!err} aria-describedby={err ? errId : undefined}
              onChange={(e) => setWhole(e.target.value)} onBlur={() => void save()} onKeyDown={keys} />
          </div>
        </span>
        <span role="cell" style={{ display: 'contents' }}>
          <div className={err ? 'box err' : 'box'} dir="ltr"><span aria-hidden="true">₪</span>
            <input aria-label={`سعر بيع ${c.name}`} inputMode="decimal" value={sale} aria-invalid={!!err} aria-describedby={err ? errId : undefined}
              onChange={(e) => setSale(e.target.value)} onBlur={() => void save()} onKeyDown={keys} />
          </div>
        </span>
        <span role="cell">
          {err ? <span id={errId} className="emsg" role="alert">{err}</span>
            : margin === null ? '—'
            : margin < 0 ? <span className="emsg">{t('err.marginNegative')}</span>
            : <span className="m">{formatMoney(margin)}</span>}
        </span>
        <div role="cell" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-g sm" title="تعديل الفئة" onClick={() => setEditing(true)}>تعديل</button>
          <button type="button" className="btn btn-d sm" title="حذف الفئة" onClick={() => setDeleting(true)}>حذف</button>
        </div>
      </div>

      {editing && (
        <EditCategory
          c={c}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            say('تم تعديل الفئة بنجاح.')
            dispatch({ type: 'changed' })
          }}
        />
      )}

      {deleting && (
        <Dialog
          title={`حذف فئة ${c.name}`}
          okLabel="نعم، احذف"
          danger
          busy={delBusy}
          onCancel={() => setDeleting(false)}
          onOk={async () => {
            setDelBusy(true)
            const r = await api.deleteCategory(c.id)
            setDelBusy(false)
            if (!r.ok) return say(errorText(r.error))
            setDeleting(false)
            say(`تم حذف فئة ${c.name}.`)
            dispatch({ type: 'changed' })
          }}
          body="هل أنت متأكد من حذف هذه الفئة؟ إذا كان هناك كروت سابقة عليها فستتم أرشفتها لحفظ الحسابات ولن تظهر في الكروت الجديدة."
        />
      )}
    </>
  )
}

function EditCategory({ c, onDone, onCancel }: { c: CategoryRow; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const profiles = useApi(() => api.routerProfiles())
  const servers = useApi(() => api.hotspotServers())
  const [name, setName] = useState(c.name)
  const [profile, setProfile] = useState(c.routerProfile)
  const [server, setServer] = useState(c.hotspotServer ?? '')
  const [err, setErr] = useState('')
  const list = profiles.state === 'ready' ? profiles.data : null
  const srvList = servers.state === 'ready' ? servers.data : []

  return (
    <Dialog title={`تعديل فئة ${c.name}`} okLabel="حفظ" error={err} busy={busy} onCancel={onCancel} body="تعديل اسم الفئة أو ملف الراوتر أو السيرفر."
      onOk={async () => {
        if (!name.trim()) return setErr(t('err.catName'))
        setBusy(true)
        const r = await api.updateCategory(c.id, { name: name.trim(), routerProfile: profile.trim(), hotspotServer: server.trim() || null })
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        onDone()
      }}>
      <div className="fld"><label className="lbl" htmlFor="ecn">اسم الفئة</label><div className="box"><input id="ecn" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} /></div></div>
      <div className="fld">
        <label className="lbl" htmlFor="ecp">ملف Hotspot على الراوتر</label>
        <div className="box">
          {list
            ? <select id="ecp" value={profile} onChange={(e) => setProfile(e.target.value)}>{list.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            : <input id="ecp" dir="ltr" value={profile} onChange={(e) => { setProfile(e.target.value); setErr('') }} />}
        </div>
      </div>
      {srvList.length > 0 && (
        <div className="fld">
          <label className="lbl" htmlFor="ecs">{t('cat.server')}</label>
          <div className="box">
            <select id="ecs" value={server} onChange={(e) => setServer(e.target.value)}>
              <option value="">{t('cat.serverAll')}</option>
              {srvList.map((srv) => (
                <option key={srv} value={srv}>{srv}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function AddCategory({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const profiles = useApi(() => api.routerProfiles())
  const servers = useApi(() => api.hotspotServers())
  const [name, setName] = useState('')
  const [profile, setProfile] = useState('')
  const [server, setServer] = useState('')
  const [whole, setWhole] = useState('')
  const [err, setErr] = useState('')
  const [isNewProfile, setIsNewProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newRateLimit, setNewRateLimit] = useState('')

  const list = profiles.state === 'ready' ? profiles.data : null
  const srvList = servers.state === 'ready' ? servers.data : []
  useEffect(() => { if (list?.length && !profile) setProfile(list[0]!) }, [list, profile])

  return (
    <Dialog title="أضف فئة" okLabel="أضف" error={err} busy={busy} onCancel={onCancel} body="الوقت والسرعة بنربطهم بملف Hotspot على الراوتر."
      onOk={async () => {
        const w = parseAgorot(whole)
        if (!name.trim()) return setErr(t('err.catName'))
        if (!(w > 0)) return setErr(t('err.catWhole'))

        let targetProfile = profile.trim()
        if (isNewProfile) {
          if (!newProfileName.trim()) return setErr('اكتب اسم ملف الـ Hotspot الجديد على الراوتر.')
          setBusy(true)
          const pRes = await api.addRouterProfile({
            name: newProfileName.trim(),
            rateLimit: newRateLimit.trim() || undefined
          })
          if (!pRes.ok) {
            setBusy(false)
            return setErr('تعذر إنشاء الملف على الراوتر. تأكد من اتصال الراوتر.')
          }
          targetProfile = newProfileName.trim()
        }

        if (!targetProfile) return setErr('اختار أو اكتب ملف الفئة على الراوتر.')
        setBusy(true)
        const r = await api.addCategory({ name, routerProfile: targetProfile, wholeAg: w, hotspotServer: server.trim() || null })
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        onDone(name.trim())
      }}>
      <div className="fld"><label className="lbl" htmlFor="cn">اسم الفئة</label><div className="box"><input id="cn" value={name} placeholder="مثلاً: ساعة، 3 ساعات، يوم كامل" onChange={(e) => { setName(e.target.value); setErr('') }} /></div></div>

      {srvList.length > 0 && (
        <div className="fld">
          <label className="lbl" htmlFor="cs">{t('cat.server')}</label>
          <div className="box">
            <select id="cs" value={server} onChange={(e) => setServer(e.target.value)}>
              <option value="">{t('cat.serverAll')}</option>
              {srvList.map((srv) => (
                <option key={srv} value={srv}>{srv}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="fld">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <label className="lbl" htmlFor="cp" style={{ marginBottom: 0 }}>ملف Hotspot على الراوتر</label>
          <button type="button" className="btn btn-g sm" style={{ padding: '0 8px', minHeight: '28px', fontSize: '12px' }} onClick={() => setIsNewProfile(!isNewProfile)}>
            {isNewProfile ? '← اختر من ملفات الراوتر' : '+ إنشاء ملف جديد على الراوتر'}
          </button>
        </div>

        {!isNewProfile ? (
          <div className="box">
            {list
              ? <select id="cp" value={profile} onChange={(e) => setProfile(e.target.value)}>{list.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              : <input id="cp" dir="ltr" value={profile} placeholder="3h" onChange={(e) => { setProfile(e.target.value); setErr('') }} />}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="box">
              <input id="npn" dir="ltr" value={newProfileName} placeholder="اسم الملف بالراوتر (مثلاً: 10M أو 2h)" onChange={(e) => { setNewProfileName(e.target.value); setErr('') }} />
            </div>
            <div className="box">
              <input id="npr" dir="ltr" value={newRateLimit} placeholder="سرعة النت Rate Limit (اختياري: مثلاً 5M/10M)" onChange={(e) => { setNewRateLimit(e.target.value); setErr('') }} />
            </div>
            <span className="sub small">سيتم إنشاء البروفايل مباشرة بالراوتر مع ضبط الحذف التلقائي للكروت المنتهية.</span>
          </div>
        )}
      </div>

      <div className="fld"><label className="lbl" htmlFor="cw">سعر الجملة</label><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input id="cw" inputMode="decimal" value={whole} onChange={(e) => { setWhole(e.target.value); setErr('') }} /></div></div>
    </Dialog>
  )
}

export function Prices() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const cats = useApi(() => api.categories())
  const [adding, setAdding] = useState(false)

  return (
    <section className="panel scr" aria-label={isEn ? 'Categories & Prices' : 'الفئات والأسعار'}>
      <div className="panel-head">
        <span className="sub">{isEn ? 'Each category maps to a Hotspot profile on the router. Wholesale price is charged to distributor.' : 'كل فئة مربوطة بملف Hotspot على الراوتر. سعر الجملة هو اللي بيتحسب على الموزع.'}</span>
        <button type="button" className="btn btn-s sm" onClick={() => setAdding(true)}>{t('batch.addCategory')}</button>
      </div>
      <div style={{ overflowX: 'auto' }} tabIndex={0} role="group" aria-label={isEn ? 'Categories and Prices, scrollable' : 'الفئات والأسعار، قابل للتمرير'}>
        <div role="table" aria-label={isEn ? 'Categories and Prices' : 'الفئات والأسعار'} style={{ minWidth: 680 }}>
          <div role="row" className="rowx thead" style={COLS}>
            <span role="columnheader">{isEn ? 'Category' : 'الفئة'}</span><span role="columnheader">{isEn ? 'Wholesale Price' : 'سعر الجملة'}</span>
            <span role="columnheader">{isEn ? 'Retail Price' : 'سعر البيع'}</span><span role="columnheader">{isEn ? 'Margin' : 'ربح الموزع'}</span>
            <span role="columnheader" style={{ textAlign: 'end' }}>{t('common.actions')}</span>
          </div>
          {cats.state === 'ready' && cats.data.map((c) => <PriceRow key={c.id} c={c} />)}
        </div>
      </div>
      {adding && (
        <AddCategory onCancel={() => setAdding(false)} onDone={(name) => {
          setAdding(false)
          say(isEn ? `Added category ${name}. Set retail price.` : `انضافت فئة ${name}. حدد سعر البيع.`)
          dispatch({ type: 'changed' })
        }} />
      )}
    </section>
  )
}
