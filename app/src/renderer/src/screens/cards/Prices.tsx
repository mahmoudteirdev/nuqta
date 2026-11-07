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

const COLS = { gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }
const plain = (ag: number) => (ag % 100 ? (ag / 100).toFixed(2) : String(ag / 100))

/** صف فئة. السعر بينحفظ لما تطلع من الحقل أو تضغط Enter، وبيأثر على الدفعات الجاية بس. */
function PriceRow({ c }: { c: CategoryRow }) {
  const say = useToast()
  const { dispatch } = useStore()
  const [whole, setWhole] = useState(plain(c.wholeAg))
  const [sale, setSale] = useState(plain(c.saleAg))
  const [err, setErr] = useState('')
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
    say(`انحفظ سعر ${c.name}. الدفعات القديمة ما بتتغير.`)
    dispatch({ type: 'changed' })
  }
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }
  const errId = `pe-${c.id}`

  return (
    <div role="row" className="rowx" style={COLS}>
      <strong role="cell">{c.name}</strong>
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
    </div>
  )
}

function AddCategory({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const profiles = useApi(() => api.routerProfiles())
  const [name, setName] = useState('')
  const [profile, setProfile] = useState('')
  const [whole, setWhole] = useState('')
  const [err, setErr] = useState('')
  const list = profiles.state === 'ready' ? profiles.data : null
  useEffect(() => { if (list?.length && !profile) setProfile(list[0]!) }, [list, profile])

  return (
    <Dialog title="أضف فئة" okLabel="أضف" error={err} busy={busy} onCancel={onCancel} body="الوقت والسرعة بنربطهم بملف Hotspot على الراوتر."
      onOk={async () => {
        const w = parseAgorot(whole)
        if (!name.trim()) return setErr(t('err.catName'))
        if (!(w > 0)) return setErr(t('err.catWhole'))
        if (!profile.trim()) return setErr('اختار ملف الفئة على الراوتر.')
        setBusy(true)
        const r = await api.addCategory({ name, routerProfile: profile, wholeAg: w })
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        onDone(name.trim())
      }}>
      <div className="fld"><label className="lbl" htmlFor="cn">اسم الفئة</label><div className="box"><input id="cn" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} /></div></div>
      <div className="fld">
        <label className="lbl" htmlFor="cp">ملف Hotspot على الراوتر</label>
        <div className="box">
          {list
            ? <select id="cp" value={profile} onChange={(e) => setProfile(e.target.value)}>{list.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            : <input id="cp" dir="ltr" value={profile} placeholder="3h" onChange={(e) => { setProfile(e.target.value); setErr('') }} />}
        </div>
        {profiles.state === 'ready' && !list && <span className="sub small">الراوتر مش راد، فاكتب اسم الملف بإيدك.</span>}
      </div>
      <div className="fld"><label className="lbl" htmlFor="cw">سعر الجملة</label><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input id="cw" inputMode="decimal" value={whole} onChange={(e) => { setWhole(e.target.value); setErr('') }} /></div></div>
    </Dialog>
  )
}

export function Prices() {
  const { dispatch } = useStore()
  const say = useToast()
  const cats = useApi(() => api.categories())
  const [adding, setAdding] = useState(false)

  return (
    <section className="panel scr" aria-label="الفئات والأسعار">
      <div className="panel-head">
        <span className="sub">كل فئة مربوطة بملف Hotspot على الراوتر. سعر الجملة هو اللي بيتحسب على الموزع.</span>
        <button type="button" className="btn btn-s sm" onClick={() => setAdding(true)}>أضف فئة</button>
      </div>
      <div style={{ overflowX: 'auto' }} tabIndex={0} role="group" aria-label="الفئات والأسعار، قابل للتمرير">
        <div role="table" aria-label="الفئات والأسعار" style={{ minWidth: 640 }}>
          <div role="row" className="rowx thead" style={COLS}>
            <span role="columnheader">الفئة</span><span role="columnheader">سعر الجملة</span>
            <span role="columnheader">سعر البيع</span><span role="columnheader">ربح الموزع</span>
          </div>
          {cats.state === 'ready' && cats.data.map((c) => <PriceRow key={c.id} c={c} />)}
        </div>
      </div>
      {adding && (
        <AddCategory onCancel={() => setAdding(false)} onDone={(name) => {
          setAdding(false)
          say(`انضافت فئة ${name}. حدد سعر البيع.`)
          dispatch({ type: 'changed' })
        }} />
      )}
    </section>
  )
}
