import { useEffect, useRef, useState } from 'react'
import type { SetupCategoryDraft, SetupStep } from '@shared/api'
import { parseAgorot } from '@shared/input'
import { api } from '@/lib/api'
import { connectError, errorText, useOpKey } from '@/lib/actions'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useToast } from '@/shell/Toast'

const STEP_KEYS = ['setup.step1', 'setup.step2', 'setup.step3', 'setup.step4']

const plain = (ag: number) => (ag ? (ag % 100 ? (ag / 100).toFixed(2) : String(ag / 100)) : '')
const categoriesText = (n: number, isEn: boolean) => {
  if (isEn) return n === 1 ? '1 hotspot profile' : `${n} hotspot profiles`
  return n === 1 ? 'فئة وحدة' : n === 2 ? 'فئتين' : n >= 3 && n <= 10 ? `${n} فئات` : `${n} فئة`
}

function StepCard({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="card scr setup-card" aria-labelledby={id}>
      <div><h1 id={id} className="h1">{title}</h1><div className="sub">{sub}</div></div>
      {children}
    </section>
  )
}

function ConnectStep({ next }: { next: () => void }) {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <StepCard id="s1" title={t('setup.connect.title')} sub={t('setup.connect.sub')}>
      <div className="fld"><label className="lbl" htmlFor="ip">{t('setup.connect.ip')}</label><div className="box" dir="ltr"><input id="ip" value={host} placeholder="192.168.88.1" onChange={(e) => { setHost(e.target.value); setMsg(null) }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="un">{t('setup.connect.user')}</label><div className="box" dir="ltr"><input id="un" value={user} autoComplete="off" onChange={(e) => { setUser(e.target.value); setMsg(null) }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="pw">{t('setup.connect.pass')}</label><div className="box" dir="ltr"><input id="pw" type="password" value={pass} autoComplete="off" onChange={(e) => { setPass(e.target.value); setMsg(null) }} /></div></div>
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
          setMsg({ ok: true, text: t('setup.connect.ok', { n: categoriesText(n, isEn) }) })
        }}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? t('setup.connect.testing') : t('setup.connect.test')}
        </button>
        {msg?.ok && <button type="button" className="btn btn-p" onClick={next}>{t('setup.connect.next')}</button>}
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
    <StepCard id="s2" title={t('setup.cats.title')} sub={t('setup.cats.sub')}>
      {down && <div role="alert" className="bn er"><span>{t('err.routerDown')}</span> <button type="button" className="lnk" onClick={() => void load()}>{t('common.retry')}</button></div>}
      {!rows && !down && <span className="sk" style={{ width: '60%' }} />}
      {rows && (
        <div role="table" aria-label={t('setup.cats.title')} className="setup-cats">
          <div role="row" className="setup-cat head" aria-hidden="false">
            <span role="columnheader">{t('setup.cats.colCat')}</span><span role="columnheader">{t('setup.cats.colTime')}</span><span role="columnheader">{t('setup.cats.colWhole')}</span><span role="columnheader">{t('setup.cats.colSale')}</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.profile} role="row" className="setup-cat">
              <span role="cell" style={{ display: 'contents' }}><div className="box"><input aria-label={r.profile} value={r.name} onChange={(e) => set(i, 'name', e.target.value)} /></div></span>
              <span role="cell" style={{ display: 'contents' }}><div className="box" dir="ltr"><input aria-label={r.name} value={r.limitUptime} placeholder="3h" onChange={(e) => set(i, 'limitUptime', e.target.value)} /></div></span>
              <span role="cell" style={{ display: 'contents' }}><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input aria-label={r.name} inputMode="decimal" value={r.whole} onChange={(e) => set(i, 'whole', e.target.value)} /></div></span>
              <span role="cell" style={{ display: 'contents' }}><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input aria-label={r.name} inputMode="decimal" value={r.sale} onChange={(e) => set(i, 'sale', e.target.value)} /></div></span>
            </div>
          ))}
        </div>
      )}
      {err && <span className="emsg" role="alert">{err}</span>}
      <div className="setup-actions">
        <button type="button" className="btn btn-g" onClick={back}>{t('common.back')}</button>
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
          if (!drafts.length) return setErr(t('setup.cats.errAtLeastOne'))
          setBusy(true)
          const res = await api.saveSetupCategories(drafts)
          setBusy(false)
          if (!res.ok) return setErr(res.error.code === 'setup_uptime' ? t('setup.cats.errUptime', { name: res.error.codes?.[0] ?? '' }) : errorText(res.error))
          next()
        }}>{t('setup.cats.next')}</button>
      </div>
    </StepCard>
  )
}

function DistributorsStep({ back, next }: { back: () => void; next: () => void }) {
  const { state } = useStore()
  const isEn = state.lang === 'en'
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
    setMsg(t('setup.dist.added', { name: name.trim() }))
    setName('')
    setOpening('')
    document.getElementById('nn')?.focus()
  }

  return (
    <StepCard id="s3" title={t('setup.dist.title')} sub={t('setup.dist.sub')}>
      <div className="fld"><label className="lbl" htmlFor="nn">{t('setup.dist.name')}</label><div className={err ? 'box err' : 'box'}><input id="nn" value={name} aria-invalid={!!err} aria-describedby={err ? 'nnE' : undefined} onChange={(e) => { setName(e.target.value); setErr(''); setMsg('') }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="no">{t('setup.dist.opening')}</label><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input id="no" inputMode="decimal" value={opening} placeholder="0" onChange={(e) => { setOpening(e.target.value); setErr('') }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} /></div></div>
      {msg && <div role="status" className="bn ok">{msg}</div>}
      {err && <span id="nnE" className="emsg" role="alert">{err}</span>}
      {added.length > 0 && <div className="sub small">{t('setup.dist.list', { names: added.join(isEn ? ', ' : '، ') })}</div>}
      <div className="setup-actions">
        <div className="row-btns">
          <button type="button" className="btn btn-g" onClick={back}>{t('common.back')}</button>
          <button type="button" className="btn btn-s" disabled={busy} onClick={() => void add()}>{t('setup.dist.add')}</button>
        </div>
        <button type="button" className="btn btn-p" onClick={next}>{t('setup.dist.next')}</button>
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
    <StepCard id="s4" title={t('setup.test.title')} sub={t('setup.test.sub')}>
      {(!card || !card.confirmed) && (
        <div className="setup-actions">
          <button type="button" className="btn btn-g" onClick={back}>{t('common.back')}</button>
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => void gen()}>
            {busy && <span className="spin" aria-hidden="true" />}
            {busy ? t('setup.test.sending') : card ? t('setup.test.resend') : t('setup.test.gen')}
          </button>
        </div>
      )}
      {err && <span className="emsg" role="alert">{err}</span>}
      {card && !card.confirmed && <div role="alert" className="bn er"><span>{t('setup.test.unconfirmed', { code: card.code })}</span></div>}
      {card?.confirmed && (
        <>
          <div className="vc test-card"><div className="code" dir="ltr">{card.code}</div></div>
          <strong>{t('setup.test.prompt')}</strong>
          <div className="row-btns">
            <button type="button" className="btn btn-p" onClick={done}>{t('setup.test.worked')}</button>
            <button type="button" className="btn btn-s" onClick={() => setDiag(true)}>{t('setup.test.notWorked')}</button>
          </div>
          {diag && <div role="status" className="bn wa">{t('setup.test.hint')}</div>}
        </>
      )}
    </StepCard>
  )
}

/** أول تشغيل، بدون القائمة الجانبية. */
export function Setup({ initial }: { initial: SetupStep }) {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
          <strong className="setup-hello">{t('setup.welcome')}</strong>
          <button
            type="button"
            className="btn btn-g sm"
            style={{ fontWeight: 600, border: '1px solid var(--line)', background: '#fff' }}
            onClick={() => dispatch({ type: 'setLang', lang: isEn ? 'ar' : 'en' })}
            title={isEn ? 'التحويل إلى العربية' : 'Switch to English'}
          >
            {isEn ? 'عربي' : 'English'}
          </button>
        </div>
        <ol aria-label={t('setup.stepsLabel')} className="setup-steps">
          {STEP_KEYS.map((key, i) => {
            const n = (i + 1) as SetupStep
            const cls = n === step ? 'dot on' : n < step ? 'dot done' : 'dot'
            const name = t(key)
            return (
              <li key={key} aria-current={n === step ? 'step' : undefined}>
                <span className={cls} aria-hidden="true">{n < step ? '✓' : n}</span>{name}
                {n < step && <span className="sr">{t('setup.stepDone')}</span>}
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
            say(t('setup.test.ready'))
            dispatch({ type: 'go', screen: 'home' })
            dispatch({ type: 'status', status: await api.status() })
          }} />
        )}
      </div>
    </main>
  )
}
