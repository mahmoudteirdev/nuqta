import { useEffect, useState } from 'react'
import type { CardCheck, CardEvent } from '@shared/api'
import { normCode } from '@shared/input'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { leftText } from '@/lib/format'
import { t } from '@/lib/i18n'
import { routerUp, useStore } from '@/lib/store'
import { Dialog } from '@/shell/Dialog'
import { ExtendDialog } from '@/shell/ExtendDialog'
import { useToast } from '@/shell/Toast'

function when(iso: string, isEn: boolean): string {
  const d = new Date(iso)
  const today = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(today) - day(d)) / 86_400_000)
  const clock = new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' })
  const dayMonth = new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { day: 'numeric', month: 'long' })
  if (diff === 0) return isEn ? `Today, ${clock.format(d)}` : `اليوم، ${clock.format(d)}`
  if (diff === 1) return isEn ? `Yesterday, ${clock.format(d)}` : `أمس، ${clock.format(d)}`
  return dayMonth.format(d)
}

function eventText(e: CardEvent, isEn: boolean): [string, string] {
  if (e.kind === 'expired') return isEn ? ['Expired', ''] : ['انتهى الوقت', '']
  const tStr = when(e.at, isEn)
  if (isEn) {
    switch (e.kind) {
      case 'generated': return ['Generated', tStr]
      case 'confirmed': return ['Confirmed by router', tStr]
      case 'printed': return [e.times === 1 ? 'Printed once' : `Printed ${e.times} times`, tStr]
      case 'delivered': return [e.to ? `Delivered to ${e.to}` : 'Direct sale', tStr]
      case 'used': return ['First used', tStr]
      case 'returned': return [e.from ? `Returned from ${e.from}` : 'Returned', tStr]
    }
  }
  switch (e.kind) {
    case 'generated': return ['تولّد', tStr]
    case 'confirmed': return ['أكده الراوتر', tStr]
    case 'printed': return [e.times === 1 ? 'انطبع مرة واحدة' : e.times === 2 ? 'انطبع مرتين' : `انطبع ${e.times} مرات`, tStr]
    case 'delivered': return [e.to ? `تسلّم ل${e.to}` : 'انباع مباشر', tStr]
    case 'used': return ['أول استخدام', tStr]
    case 'returned': return [e.from ? `رجع من ${e.from}` : 'رجع', tStr]
  }
}

function verdictText(c: CardCheck, network: string, isEn: boolean): { title: string; next: string } {
  if (isEn) {
    const wifi = `Ask customer to connect to "${network || 'Wi-Fi'}" and verify the code.`
    switch (c.verdict) {
      case 'not_on_router_yet':
        return { title: 'Card not yet added to router', next: `Router has not confirmed this card. Open batch B-${c.batchNo} and resend missing.` }
      case 'not_delivered':
        return { title: 'Card not yet delivered', next: 'Card is ready on router, but not delivered to distributor or sold.' }
      case 'returned':
        return { title: 'Card returned and disabled', next: `${c.distributorName ? `Returned by ${c.distributorName}` : 'Returned'} and stopped on router. Customer needs a new card.` }
      case 'in_use':
        return { title: 'Card is currently active', next: `Active session with MAC ending in ${c.session?.mac.slice(-5) ?? ''}. Disconnect if not the customer.` }
      case 'expired':
        return { title: 'Card uptime has expired', next: `Network is fine. ${c.categoryName} time is finished; ask customer to get a new card.` }
      case 'used_time_left':
        return { title: 'Card is active with remaining time', next: `Remaining: ${leftText(c.secondsLeft, c.limitSeconds, 'en')}. ${wifi}` }
      case 'unused':
        return { title: 'Card is valid and unused', next: wifi }
      case 'missing_on_router':
        return { title: 'Card missing on router', next: 'Log shows confirmed earlier, but router does not recognise it now. Router was likely reset.' }
      case 'disabled':
        return { title: 'Card disabled on router', next: 'Disabled on router directly; not returned in our log. Re-enable on router if needed.' }
    }
  }
  const wifi = `خلي الزبون يتأكد إنه متصل بواي فاي ${network || 'الشبكة'} ويكتب الكود مزبوط.`
  switch (c.verdict) {
    case 'not_on_router_yet':
      return { title: 'الكرت لسا ما انضاف للراوتر', next: `الراوتر ما أكد هالكرت، فما بيشتغل. افتح الدفعة B-${c.batchNo} وأعد إرسال الناقص.` }
    case 'not_delivered':
      return { title: 'الكرت لسا ما انسلم', next: 'الكرت جاهز على الراوتر، بس ما انسلم لموزع ولا انباع. إذا الزبون معه، الكرت طلع من عندك قبل التسليم.' }
    case 'returned':
      return { title: 'الكرت مرتجع وموقوف', next: `${c.distributorName ? `رجّعه ${c.distributorName}` : 'انرجع'}، وانوقف على الراوتر. الزبون لازم ياخذ كرت جديد.` }
    case 'in_use':
      return { title: 'الكرت شغال الآن', next: `في جهاز مستخدمه هلأ، عنوانه بينتهي بـ${c.session?.mac.slice(-5) ?? ''}. إذا الزبون مش هو، افصل الجلسة.` }
    case 'expired':
      return { title: 'الكرت خلص وقته', next: `الشبكة سليمة. انتهت الـ${c.categoryName}، فقول للزبون يشتري كرت جديد.` }
    case 'used_time_left':
      return { title: 'الكرت سليم وباقي فيه وقت', next: `باقي ${leftText(c.secondsLeft, c.limitSeconds, 'ar')}. ${wifi}` }
    case 'unused':
      return { title: 'الكرت سليم ولسا ما انستخدم', next: wifi }
    case 'missing_on_router':
      return { title: 'الكرت مش موجود على الراوتر', next: 'سجلنا بيقول إن الراوتر أكده، بس الراوتر هلأ ما بيعرفه. غالبا الراوتر انعمله reset. الحسابات ما تغيرت، وافحص الراوتر من شاشة الشبكة.' }
    case 'disabled':
      return { title: 'الكرت موقوف على الراوتر', next: 'حدا أوقفه من الراوتر مباشرة، ومش مرتجع عندنا. إذا بدك يشتغل، فعّله من الراوتر.' }
  }
}

type Result = { state: 'idle' } | { state: 'busy' } | { state: 'missing'; code: string } | { state: 'found'; card: CardCheck }

export function Card() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [input, setInput] = useState(state.cardCode)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Result>({ state: 'idle' })
  const [kick, setKick] = useState(false)
  const [kickBusy, setKickBusy] = useState(false)
  const [kickErr, setKickErr] = useState('')
  const [extending, setExtending] = useState(false)

  const run = async (raw: string) => {
    const code = normCode(raw)
    if (!code) return setErr(t('err.cardEmpty'))
    setErr('')
    setInput(code)
    setRes({ state: 'busy' })
    const card = await api.checkCard(code)
    setRes(card ? { state: 'found', card } : { state: 'missing', code })
  }

  // الكود اللي وصل من البحث فوق.
  useEffect(() => {
    if (state.cardCode) void run(state.cardCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cardCode])

  const busy = res.state === 'busy'
  const card = res.state === 'found' ? res.card : null
  const text = card ? verdictText(card, state.status?.networkName ?? '', isEn) : null

  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <h1 className="h1">{t('card.title')}</h1>
      <form className="check-form" onSubmit={(e) => { e.preventDefault(); if (!busy) void run(input) }}>
        <div className="fld" style={{ flex: '1 1 260px' }}>
          <label className="lbl" htmlFor="code">{t('card.lblCode')}</label>
          <div className={err ? 'box err' : 'box'} dir="ltr">
            <input id="code" className="mono-in" value={input} placeholder="7K4F-92QM" aria-invalid={!!err} aria-describedby={err ? 'codeE' : undefined}
              onChange={(e) => { setInput(e.target.value); setErr('') }} />
          </div>
          {err && <span id="codeE" className="emsg" role="alert">{err}</span>}
        </div>
        <button type="submit" className="btn btn-p" style={{ marginTop: 26 }} disabled={busy}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? t('card.btnSearching') : t('card.btnSearch')}
        </button>
      </form>

      {res.state === 'missing' && (
        <div className="bn er scr" role="alert"><span><strong>{t('err.cardMissing')}</strong> {t('card.missingHelp')}</span></div>
      )}

      {card && text && (
        <div className="scr card-res">
          <section aria-label="نتيجة الفحص" className="card-main">
            {!card.routerChecked && <div role="status" className="bn wa"><span>{t('card.routerUnchecked')}</span></div>}
            <div className="card top" role="status">
              <strong className="verdict">{text.title}</strong>
              <p className="verdict-next">{text.next}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 12 }}>
                {card.verdict === 'in_use' && card.session && routerUp(state) && (
                  <button type="button" className="btn btn-d" onClick={() => { setKickErr(''); setKick(true) }}>{t('card.btnKick')}</button>
                )}
                {card.routerChecked && routerUp(state) && (
                  <button type="button" className="btn btn-s" onClick={() => setExtending(true)}>{t('card.btnExtend')}</button>
                )}
                {card.verdict === 'not_on_router_yet' && (
                  <button type="button" className="btn btn-p" onClick={() => dispatch({ type: 'go', screen: 'batch', batchId: card.batchId })}>{t('card.btnOpenBatch')}</button>
                )}
              </div>
            </div>
            <div className="card facts">
              <div><span className="sub">{t('card.factCat')}</span><strong>{card.categoryName}</strong></div>
              <div><span className="sub">{t('card.factBatch')}</span><strong dir="ltr">B-{card.batchNo}</strong></div>
              <div><span className="sub">{t('card.factDist')}</span><strong>{card.distributorName ?? t('card.factDirect')}</strong></div>
              <div><span className="sub">{t('card.factTime')}</span><strong>{leftText(card.secondsLeft, card.limitSeconds, state.lang)}</strong></div>
            </div>
          </section>
          <aside className="card history" aria-labelledby="hist">
            <h2 id="hist" className="h2">{t('card.histTitle')}</h2>
            {card.history.map((e, i) => {
              const [a, b] = eventText(e, isEn)
              return <div key={i} className="hist-row"><span>{a}</span><span className="sub">{b}</span></div>
            })}
          </aside>
        </div>
      )}

      {extending && card && (
        <ExtendDialog
          code={card.code}
          onCancel={() => setExtending(false)}
          onDone={() => {
            setExtending(false)
            void run(card.code)
          }}
        />
      )}
      {kick && card?.session && (
        <Dialog title={t('dlg.kick.title', { code: card.code })} body={t('dlg.kick.body')} okLabel={t('dlg.kick.ok')} danger
          busy={kickBusy} busyLabel="جاري الفصل" error={kickErr} onCancel={() => setKick(false)}
          onOk={async () => {
            setKickBusy(true)
            const r = await api.kickSession(card.session!.id)
            setKickBusy(false)
            if (!r.ok) return setKickErr(r.error.code === 'unreachable' || r.error.code === 'timeout' ? t('err.routerDown') : errorText(r.error))
            setKick(false)
            say(t('toast.kicked', { code: card.code }))
            void run(card.code)
          }} />
      )}
    </div>
  )
}
