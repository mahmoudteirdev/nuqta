import { useEffect, useState } from 'react'
import type { CardCheck, CardEvent } from '@shared/api'
import { normCode } from '@shared/input'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { leftText } from '@/lib/format'
import { t } from '@/lib/i18n'
import { routerUp, useStore } from '@/lib/store'
import { Dialog } from '@/shell/Dialog'
import { useToast } from '@/shell/Toast'

const dayMonth = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long' })
const clock = new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' })

/** اليوم، 5:20 م · أمس، 8:20 م · 6 أكتوبر */
function when(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(today) - day(d)) / 86_400_000)
  if (diff === 0) return `اليوم، ${clock.format(d)}`
  if (diff === 1) return `أمس، ${clock.format(d)}`
  return dayMonth.format(d)
}

function eventText(e: CardEvent): [string, string] {
  switch (e.kind) {
    case 'generated': return ['تولّد', when(e.at)]
    case 'confirmed': return ['أكده الراوتر', when(e.at)]
    case 'printed': return [e.times === 1 ? 'انطبع مرة واحدة' : e.times === 2 ? 'انطبع مرتين' : `انطبع ${e.times} مرات`, when(e.at)]
    case 'delivered': return [e.to ? `تسلّم ل${e.to}` : 'انباع مباشر', when(e.at)]
    case 'used': return ['أول استخدام', when(e.at)]
    case 'returned': return [e.from ? `رجع من ${e.from}` : 'رجع', when(e.at)]
    case 'expired': return ['انتهى الوقت', '']
  }
}

function verdictText(c: CardCheck, network: string): { title: string; next: string } {
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
      return { title: 'الكرت سليم وباقي فيه وقت', next: `باقي ${leftText(c.secondsLeft, c.limitSeconds)}. ${wifi}` }
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
  const say = useToast()
  const [input, setInput] = useState(state.cardCode)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Result>({ state: 'idle' })
  const [kick, setKick] = useState(false)
  const [kickBusy, setKickBusy] = useState(false)
  const [kickErr, setKickErr] = useState('')

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
  const text = card ? verdictText(card, state.status?.networkName ?? '') : null

  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <h1 className="h1">فحص كرت</h1>
      <form className="check-form" onSubmit={(e) => { e.preventDefault(); if (!busy) void run(input) }}>
        <div className="fld" style={{ flex: '1 1 260px' }}>
          <label className="lbl" htmlFor="code">كود الكرت</label>
          <div className={err ? 'box err' : 'box'} dir="ltr">
            <input id="code" className="mono-in" value={input} placeholder="7K4F-92QM" aria-invalid={!!err} aria-describedby={err ? 'codeE' : undefined}
              onChange={(e) => { setInput(e.target.value); setErr('') }} />
          </div>
          {err && <span id="codeE" className="emsg" role="alert">{err}</span>}
        </div>
        <button type="submit" className="btn btn-p" style={{ marginTop: 26 }} disabled={busy}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? 'جاري البحث' : 'افحص'}
        </button>
      </form>

      {res.state === 'missing' && (
        <div className="bn er scr" role="alert"><span><strong>{t('err.cardMissing')}</strong> تأكد من الكتابة، أو اسأل الموزع عن رقم الدفعة.</span></div>
      )}

      {card && text && (
        <div className="scr card-res">
          <section aria-label="نتيجة الفحص" className="card-main">
            {!card.routerChecked && <div role="status" className="bn wa"><span>الراوتر مش راد، فالنتيجة من سجلنا بس.</span></div>}
            <div className="card top" role="status">
              <strong className="verdict">{text.title}</strong>
              <p className="verdict-next">{text.next}</p>
              {card.verdict === 'in_use' && card.session && routerUp(state) && (
                <button type="button" className="btn btn-d" style={{ marginTop: 12 }} onClick={() => { setKickErr(''); setKick(true) }}>افصل الجلسة</button>
              )}
              {card.verdict === 'not_on_router_yet' && (
                <button type="button" className="btn btn-p" style={{ marginTop: 12 }} onClick={() => dispatch({ type: 'go', screen: 'batch', batchId: card.batchId })}>افتح الدفعة</button>
              )}
            </div>
            <div className="card facts">
              <div><span className="sub">الفئة</span><strong>{card.categoryName}</strong></div>
              <div><span className="sub">الدفعة</span><strong dir="ltr">B-{card.batchNo}</strong></div>
              <div><span className="sub">الموزع</span><strong>{card.distributorName ?? 'بيع مباشر'}</strong></div>
              <div><span className="sub">الوقت الباقي</span><strong>{leftText(card.secondsLeft, card.limitSeconds)}</strong></div>
            </div>
          </section>
          <aside className="card history" aria-labelledby="hist">
            <h2 id="hist" className="h2">سجل الكرت</h2>
            {card.history.map((e, i) => {
              const [a, b] = eventText(e)
              return <div key={i} className="hist-row"><span>{a}</span><span className="sub">{b}</span></div>
            })}
          </aside>
        </div>
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
