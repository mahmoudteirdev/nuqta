import { useEffect, useRef, useState } from 'react'
import type { SetupCategoryDraft, SetupStep } from '@shared/api'
import { parseAgorot } from '@shared/input'
import { api } from '@/lib/api'
import { connectError, errorText, useOpKey } from '@/lib/actions'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useToast } from '@/shell/Toast'

const STEPS = ['ربط الراوتر', 'الفئات والأسعار', 'الموزعين والأرصدة', 'كرت تجربة']

const plain = (ag: number) => (ag ? (ag % 100 ? (ag / 100).toFixed(2) : String(ag / 100)) : '')
const categoriesText = (n: number) => (n === 1 ? 'فئة وحدة' : n === 2 ? 'فئتين' : n >= 3 && n <= 10 ? `${n} فئات` : `${n} فئة`)

function StepCard({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="card scr setup-card" aria-labelledby={id}>
      <div><h1 id={id} className="h1">{title}</h1><div className="sub">{sub}</div></div>
      {children}
    </section>
  )
}

function ConnectStep({ next }: { next: () => void }) {
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <StepCard id="s1" title="وصّل الراوتر" sub="لازم يكون جهازك على نفس شبكة الراوتر. فعّل خدمة api-ssl من IP > Services، واستخدم حساب بصلاحيات محدودة مش حساب المدير.">
      <div className="fld"><label className="lbl" htmlFor="ip">عنوان الراوتر</label><div className="box" dir="ltr"><input id="ip" value={host} placeholder="192.168.88.1" onChange={(e) => { setHost(e.target.value); setMsg(null) }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="un">اسم المستخدم</label><div className="box" dir="ltr"><input id="un" value={user} autoComplete="off" onChange={(e) => { setUser(e.target.value); setMsg(null) }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="pw">كلمة المرور</label><div className="box" dir="ltr"><input id="pw" type="password" value={pass} autoComplete="off" onChange={(e) => { setPass(e.target.value); setMsg(null) }} /></div></div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'bn ok' : 'bn er'}><span>{msg.text}</span></div>}
      <div className="setup-actions">
        <button type="button" className="btn btn-s" disabled={busy} onClick={async () => {
          if (!host.trim()) return setMsg({ ok: false, text: t('err.routerIp') })
          if (!user.trim() || !pass) return setMsg({ ok: false, text: t('err.routerCreds') })
          setBusy(true)
          const r = await api.connectRouter({ host, user, password: pass })
          setBusy(false)
          if (!r.ok) return setMsg({ ok: false, text: connectError(r.error.code) })
          setPass('')
          const n = r.value.profiles.filter((p) => p.toLowerCase() !== 'default').length
          setMsg({ ok: true, text: `تم الاتصال بالراوتر. لقينا ${categoriesText(n)} هوتسبوت.` })
        }}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? 'جاري الفحص' : 'اختبر الاتصال'}
        </button>
        {msg?.ok && <button type="button" className="btn btn-p" onClick={next}>التالي: الفئات والأسعار</button>}
      </div>
    </StepCard>
  )
}

type Row = { name: string; profile: string; limitUptime: string; whole: string; sale: string }

function CategoriesStep({ back, next }: { back: () => void; next: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [down, setDown] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setDown(false)
    const r = await api.setupCategories()
    if (!r.drafts) return setDown(true)
    setRows(r.drafts.map((d) => ({ name: d.name, profile: d.profile, limitUptime: d.limitUptime, whole: plain(d.wholeAg), sale: plain(d.saleAg) })))
  }
  useEffect(() => { void load() }, [])
  const set = (i: number, k: keyof Row, v: string) => { setRows((p) => p && p.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setErr('') }

  return (
    <StepCard id="s2" title="الفئات والأسعار" sub="لقينا هالفئات على الراوتر. راجع السعر قبل ما تكمل، واترك سعر الجملة فاضي للفئة اللي ما بتبيعها.">
      {down && <div role="alert" className="bn er"><span>{t('err.routerDown')}</span> <button type="button" className="lnk" onClick={() => void load()}>جرّب مرة ثانية</button></div>}
      {!rows && !down && <span className="sk" style={{ width: '60%' }} />}
      {rows && (
        <div role="table" aria-label="الفئات والأسعار" className="setup-cats">
          <div role="row" className="setup-cat head" aria-hidden="false">
            <span role="columnheader">الفئة</span><span role="columnheader">الوقت</span><span role="columnheader">سعر الجملة</span><span role="columnheader">سعر البيع</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.profile} role="row" className="setup-cat">
              <span role="cell" style={{ display: 'contents' }}><div className="box"><input aria-label={`اسم فئة ${r.profile}`} value={r.name} onChange={(e) => set(i, 'name', e.target.value)} /></div></span>
              <span role="cell" style={{ display: 'contents' }}><div className="box" dir="ltr"><input aria-label={`وقت ${r.name}`} value={r.limitUptime} placeholder="3h" onChange={(e) => set(i, 'limitUptime', e.target.value)} /></div></span>
              <span role="cell" style={{ display: 'contents' }}><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input aria-label={`سعر جملة ${r.name}`} inputMode="decimal" value={r.whole} onChange={(e) => set(i, 'whole', e.target.value)} /></div></span>
              <span role="cell" style={{ display: 'contents' }}><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input aria-label={`سعر بيع ${r.name}`} inputMode="decimal" value={r.sale} onChange={(e) => set(i, 'sale', e.target.value)} /></div></span>
            </div>
          ))}
        </div>
      )}
      {err && <span className="emsg" role="alert">{err}</span>}
      <div className="setup-actions">
        <button type="button" className="btn btn-g" onClick={back}>رجوع</button>
        <button type="button" className="btn btn-p" disabled={!rows || busy} onClick={async () => {
          if (!rows) return
          const drafts: SetupCategoryDraft[] = []
          for (const r of rows) {
            if (!r.whole.trim()) continue
            const w = parseAgorot(r.whole)
            const s = r.sale.trim() ? parseAgorot(r.sale) : w
            if (!(w > 0) || !(s > 0)) return setErr(`${t('err.amountDialog')} (${r.name})`)
            drafts.push({ name: r.name, profile: r.profile, limitUptime: r.limitUptime.trim(), wholeAg: w, saleAg: s })
          }
          if (!drafts.length) return setErr('اكتب سعر الجملة لفئة وحدة على الأقل.')
          setBusy(true)
          const res = await api.saveSetupCategories(drafts)
          setBusy(false)
          if (!res.ok) return setErr(res.error.code === 'setup_uptime' ? `الوقت مش مفهوم لـ${res.error.codes?.[0]}. اكتبه زي 1h أو 3h أو 1d.` : errorText(res.error))
          next()
        }}>التالي: الموزعين</button>
      </div>
    </StepCard>
  )
}

function DistributorsStep({ back, next }: { back: () => void; next: () => void }) {
  const op = useOpKey()
  const [name, setName] = useState('')
  const [opening, setOpening] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void api.setupDistributors().then(setAdded) }, [])

  const add = async () => {
    if (!name.trim()) return setErr(t('err.distNameFirst'))
    const ag = opening.trim() ? parseAgorot(opening) : 0
    if (Number.isNaN(ag)) return setErr(t('err.amountDialog'))
    setBusy(true)
    const r = await api.addDistributor({ name: name.trim(), area: '', openingAg: ag }, op.key())
    setBusy(false)
    if (!r.ok) return setErr(errorText(r.error))
    op.renew()
    setAdded((p) => [...p, name.trim()])
    setMsg(`انضاف ${name.trim()}.`)
    setName('')
    setOpening('')
    document.getElementById('nn')?.focus()
  }

  return (
    <StepCard id="s3" title="الموزعين والأرصدة" sub="أضف موزع، واكتب الدين القديم عليه إذا موجود. بتقدر تكمل وتضيفهم بعدين.">
      <div className="fld"><label className="lbl" htmlFor="nn">اسم الموزع</label><div className={err ? 'box err' : 'box'}><input id="nn" value={name} aria-invalid={!!err} aria-describedby={err ? 'nnE' : undefined} onChange={(e) => { setName(e.target.value); setErr(''); setMsg('') }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="no">الرصيد الافتتاحي</label><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input id="no" inputMode="decimal" value={opening} placeholder="0" onChange={(e) => { setOpening(e.target.value); setErr('') }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} /></div></div>
      {msg && <div role="status" className="bn ok">{msg}</div>}
      {err && <span id="nnE" className="emsg" role="alert">{err}</span>}
      {added.length > 0 && <div className="sub small">الموزعين: {added.join('، ')}</div>}
      <div className="setup-actions">
        <div className="row-btns">
          <button type="button" className="btn btn-g" onClick={back}>رجوع</button>
          <button type="button" className="btn btn-s" disabled={busy} onClick={() => void add()}>أضف الموزع</button>
        </div>
        <button type="button" className="btn btn-p" onClick={next}>التالي: كرت تجربة</button>
      </div>
    </StepCard>
  )
}

function TestStep({ back, done }: { back: () => void; done: () => void }) {
  const [card, setCard] = useState<{ code: string; confirmed: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [diag, setDiag] = useState(false)
  const [err, setErr] = useState('')
  const gen = async () => {
    setBusy(true)
    setDiag(false)
    setErr('')
    const r = await api.setupTestCard()
    setBusy(false)
    if (!r.ok) return setErr(errorText(r.error))
    setCard(r.value)
  }
  return (
    <StepCard id="s4" title="جرّب كرت قبل الطباعة" sub="هيك بتتأكد إن الربط شغال قبل أول دفعة حقيقية.">
      {(!card || !card.confirmed) && (
        <div className="setup-actions">
          <button type="button" className="btn btn-g" onClick={back}>رجوع</button>
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => void gen()}>
            {busy && <span className="spin" aria-hidden="true" />}
            {busy ? 'جاري الإرسال' : card ? 'أعد الإرسال' : 'ولّد كرت تجربة'}
          </button>
        </div>
      )}
      {err && <span className="emsg" role="alert">{err}</span>}
      {card && !card.confirmed && <div role="alert" className="bn er"><span>الراوتر ما أكد الكرت <span dir="ltr" className="mono-in">{card.code}</span>. تأكد إنه راد وجرّب مرة ثانية.</span></div>}
      {card?.confirmed && (
        <>
          <div className="vc test-card"><div className="code" dir="ltr">{card.code}</div></div>
          <strong>جرّبته على موبايلك. اشتغل؟</strong>
          <div className="row-btns">
            <button type="button" className="btn btn-p" onClick={done}>اشتغل، خلصنا</button>
            <button type="button" className="btn btn-s" onClick={() => setDiag(true)}>ما اشتغل</button>
          </div>
          {diag && <div role="status" className="bn wa">تأكد إن الهوتسبوت شغال على الراوتر، وإن الفئة فيها وقت وسرعة، وجرّب مرة ثانية.</div>}
        </>
      )}
    </StepCard>
  )
}

/** أول تشغيل، بدون القائمة الجانبية (HANDOFF القسم 2). */
export function Setup({ initial }: { initial: SetupStep }) {
  const { dispatch } = useStore()
  const say = useToast()
  const [step, setStep] = useState<SetupStep>(initial)
  const first = useRef(true)

  const go = (s: SetupStep) => {
    setStep(s)
    void api.setSetupStep(s)
  }

  // كل خطوة جديدة بتنقل التركيز لعنوانها.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const h = document.querySelector<HTMLElement>('main h1')
    if (h) { h.setAttribute('tabindex', '-1'); h.focus() }
  }, [step])

  return (
    <main className="scr setup">
      <div className="setup-wrap">
        <strong className="setup-hello">أهلا بك في نُقطة</strong>
        <ol aria-label="الخطوات" className="setup-steps">
          {STEPS.map((name, i) => {
            const n = (i + 1) as SetupStep
            const cls = n === step ? 'dot on' : n < step ? 'dot done' : 'dot'
            return (
              <li key={name} aria-current={n === step ? 'step' : undefined}>
                <span className={cls} aria-hidden="true">{n < step ? '✓' : n}</span>{name}
                {n < step && <span className="sr"> (خلصت)</span>}
              </li>
            )
          })}
        </ol>
        {step === 1 && <ConnectStep next={() => go(2)} />}
        {step === 2 && <CategoriesStep back={() => go(1)} next={() => go(3)} />}
        {step === 3 && <DistributorsStep back={() => go(2)} next={() => go(4)} />}
        {step === 4 && (
          <TestStep back={() => go(3)} done={async () => {
            await api.finishSetup()
            say('نُقطة جاهزة. ولّد أول دفعة.')
            dispatch({ type: 'go', screen: 'home' })
            dispatch({ type: 'status', status: await api.status() })
          }} />
        )}
      </div>
    </main>
  )
}
