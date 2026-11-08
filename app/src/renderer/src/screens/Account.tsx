import { useRef, useState } from 'react'
import type { AccountDetail, StatementEntry, UsedCard } from '@shared/api'
import { normCode, parseAgorot } from '@shared/input'
import { isValidCode } from '@shared/codes'
import { api } from '@/lib/api'
import { errorText, useOpKey } from '@/lib/actions'
import { cardsText, daysText, formatBalance, formatMoney, formatSigned } from '@/lib/format'
import { actionText, cardsCell, dateText, time } from '@/lib/statement'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from '@/shell/Dialog'
import { StateView } from '@/shell/StateView'
import { useToast } from '@/shell/Toast'

// ───────────────────────── الحوارات

type DialogKind = 'add' | 'limit' | 'return' | 'dispute' | 'correct' | null

function AddDialog({ onDone, onCancel }: { onDone: (id: string, name: string) => void; onCancel: () => void }) {
  const op = useOpKey()
  const [name, setName] = useState('')
  const [opening, setOpening] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title="أضف موزع" okLabel="أضف" busy={busy} error={err} onCancel={onCancel}
      onOk={async () => {
        if (!name.trim()) return setErr(t('err.distName'))
        const openingAg = opening.trim() ? parseAgorot(opening) : 0
        if (Number.isNaN(openingAg)) return setErr(t('err.amountDialog'))
        setBusy(true)
        const r = await api.addDistributor({ name: name.trim(), area: '', openingAg }, op.key())
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        op.renew()
        onDone(r.value.id, name.trim())
      }}>
      <div className="fld"><label className="lbl" htmlFor="dn">اسم الموزع</label><div className={err && !name.trim() ? 'box err' : 'box'}><input id="dn" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} aria-invalid={!!err && !name.trim()} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="do">الدين القديم عليه، إن وجد</label><div className="box" dir="ltr"><span aria-hidden="true">₪</span><input id="do" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => { setOpening(e.target.value); setErr('') }} /></div></div>
    </Dialog>
  )
}

function LimitDialog({ cur, onDone, onCancel }: { cur: AccountDetail; onDone: (ag: number) => void; onCancel: () => void }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title={`سقف الدين على ${cur.name}`} okLabel="احفظ" busy={busy} error={err} onCancel={onCancel}
      body={`السقف الحالي ${formatMoney(cur.creditLimitAg)}. لما يتجاوزه، بيظهر تحذير قبل تسليم كروت جديدة.`}
      onOk={async () => {
        const ag = parseAgorot(v)
        if (!(ag > 0)) return setErr(t('err.amountDialog'))
        setBusy(true)
        const r = await api.setCreditLimit(cur.id, ag)
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        onDone(ag)
      }}>
      <div className="fld"><label className="lbl" htmlFor="lim">السقف الجديد بالشيكل</label><div className={err ? 'box err' : 'box'} dir="ltr"><span aria-hidden="true">₪</span><input id="lim" inputMode="decimal" value={v} onChange={(e) => { setV(e.target.value); setErr('') }} aria-invalid={!!err} /></div></div>
    </Dialog>
  )
}

/** الأكواد مكتوبة أو ممسوحة، سطر سطر أو بمسافات. */
function parseCodes(text: string): { codes: string[]; bad: string[] } {
  const codes = new Set<string>()
  const bad: string[] = []
  for (const raw of text.split(/[\s,،]+/).filter(Boolean)) {
    const c = normCode(raw)
    if (isValidCode(c)) codes.add(c)
    else bad.push(raw)
  }
  return { codes: [...codes], bad }
}

function ReturnDialog({ cur, onDone, onCancel }: { cur: AccountDetail; onDone: (n: number, routerUp: boolean) => void; onCancel: () => void }) {
  const op = useOpKey()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = parseCodes(text)
  return (
    <Dialog title={t('dlg.return.title', { name: cur.name })} okLabel={t('dlg.return.ok')} busy={busy} error={err} onCancel={onCancel}
      body={t('dlg.return.body', { name: cur.name, n: cur.held })}
      onOk={async () => {
        if (parsed.bad.length) return setErr(`مش أكواد كروت: ${parsed.bad.slice(0, 3).join('، ')}`)
        if (!parsed.codes.length) return setErr('اكتب أو امسح أكواد الكروت المرتجعة.')
        if (parsed.codes.length > cur.held) return setErr(t('err.returnOver', { n: cur.held }))
        setBusy(true)
        const r = await api.returnCards(cur.id, parsed.codes, op.key())
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        op.renew()
        onDone(r.value.count, r.value.routerUp)
      }}>
      <div className="fld">
        <label className="lbl" htmlFor="rc">أكواد الكروت</label>
        <div className={err ? 'box err area' : 'box area'}>
          <textarea id="rc" dir="ltr" rows={4} value={text} placeholder="7K4F-92QM" aria-invalid={!!err} aria-describedby="rcn"
            onChange={(e) => { setText(e.target.value); setErr('') }} />
        </div>
        <span id="rcn" className="sub">{parsed.codes.length ? `${cardsText(parsed.codes.length)} ${parsed.codes.length === 1 ? 'جاهز' : 'جاهزين'} للإرجاع` : 'كود بكل سطر، أو امسحهم بالقارئ.'}</span>
      </div>
    </Dialog>
  )
}

function DisputeDialog({ cur, onDone, onCancel }: { cur: AccountDetail; onDone: (entryId: string) => void; onCancel: () => void }) {
  const op = useOpKey()
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title={t('dlg.dispute.title', { name: cur.name })} okLabel={t('dlg.dispute.ok')} busy={busy} error={err} onCancel={onCancel}
      body={t('dlg.dispute.body')}
      onOk={async () => {
        setBusy(true)
        const r = await api.openDispute(cur.id, note, op.key())
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        op.renew()
        onDone(r.value.entryId)
      }}>
      <div className="fld"><label className="lbl" htmlFor="dnote">شو الخلاف؟ (اختياري)</label><div className="box"><input id="dnote" value={note} onChange={(e) => setNote(e.target.value)} /></div></div>
    </Dialog>
  )
}

function CorrectDialog({ cur, onDone, onCancel }: { cur: AccountDetail; onDone: (entryId: string) => void; onCancel: () => void }) {
  const op = useOpKey()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const target = cur.correctable!
  return (
    <Dialog title={t('dlg.correct.title', { amount: formatMoney(target.paidAg) })} okLabel={t('dlg.correct.ok')} danger busy={busy} error={err}
      body={t('dlg.correct.body')} onCancel={onCancel}
      onOk={async () => {
        setBusy(true)
        const r = await api.correctSettlement(cur.id, target.id, op.key())
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        op.renew()
        onDone(r.value.entryId)
      }} />
  )
}

// ───────────────────────── التسوية

function SettleForm({ cur, onSaved }: { cur: AccountDetail; onSaved: (entryId: string) => void }) {
  const say = useToast()
  const op = useOpKey()
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ paidAg: number; dueAg: number; extraAg: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  const run = async (allowExtra: boolean) => {
    const paidAg = parseAgorot(amount)
    if (!(paidAg > 0)) return setErr(t('err.amount'))
    setBusy(true)
    const r = await api.settle(cur.id, paidAg, allowExtra, op.key())
    setBusy(false)
    if (!r.ok) return setErr(errorText(r.error))
    if (r.value.kind === 'confirm') return setConfirm(r.value)
    op.renew()
    setConfirm(null)
    setAmount('')
    const v = r.value
    say(v.extraAg > 0
      ? t('toast.settledExtra', { paid: formatMoney(v.paidAg), extra: formatMoney(v.extraAg) })
      : t('toast.settled', { paid: formatMoney(v.paidAg), due: formatMoney(v.remainingAg) }))
    onSaved(v.entryId)
  }

  return (
    <div className="card settle">
      <div className="fld" style={{ flex: '1 1 240px' }}>
        <label className="lbl" htmlFor="amt">استلمت منه</label>
        <div className={err ? 'box err' : 'box'} dir="ltr">
          <span aria-hidden="true">₪</span>
          <input id="amt" inputMode="decimal" value={amount} placeholder="0" aria-invalid={!!err} aria-describedby={err ? 'amtE' : undefined}
            onChange={(e) => { setAmount(e.target.value); setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!busy) void run(false) } }} />
        </div>
        {err && <span id="amtE" className="emsg" role="alert">{err}</span>}
      </div>
      <button ref={button} type="button" className="btn btn-p" style={{ marginTop: 26 }} disabled={busy} onClick={() => void run(false)}>
        {busy && !confirm && <span className="spin" aria-hidden="true" />}
        {busy && !confirm ? 'جاري الحفظ' : 'سجّل التسوية'}
      </button>
      {confirm && (
        <Dialog title={t('dlg.overpay.title')} okLabel={t('dlg.overpay.ok')} cancelLabel={t('dlg.overpay.cancel')} busy={busy}
          body={t('dlg.overpay.body', { paid: formatMoney(confirm.paidAg), due: formatMoney(confirm.dueAg), extra: formatMoney(confirm.extraAg) })}
          returnTo={button} onCancel={() => setConfirm(null)} onOk={() => void run(true)} />
      )}
    </div>
  )
}

// ───────────────────────── الكشف

function UsageProof({ entryId }: { entryId: string }) {
  const r = useApi(() => api.usageCards(entryId), [entryId])
  return (
    <div role="row" className="scr proof">
      <div role="cell" style={{ display: 'contents' }}>
        {r.state === 'loading' && <span className="sk" style={{ width: '50%' }} />}
        {r.state === 'error' && <span className="emsg">ما قدرنا نجيب الكروت.</span>}
        {r.state === 'ready' && (
          <>
            {r.data.cards.map((c: UsedCard) => (
              <div key={c.code}>
                <span dir="ltr" className="mono-in">{c.code}</span> · {time.format(new Date(c.usedAt))}
                {c.mac && <> · جهاز ينتهي بـ<span dir="ltr">{c.mac.slice(-5)}</span></>}
              </div>
            ))}
            {!r.data.cards.length && <span className="sub">ما في تفاصيل كروت لهالحركة.</span>}
            {r.data.total > r.data.cards.length && <div className="sub">و{(r.data.total - r.data.cards.length).toLocaleString('en-US')} كرت ثاني بنفس الحركة</div>}
          </>
        )}
      </div>
    </div>
  )
}

function Statement({ cur, newId, onCorrect }: { cur: AccountDetail; newId: string | null; onCorrect: () => void }) {
  const say = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="h2">كشف الحساب</h2>
        <div className="row-btns">
          <button type="button" className="btn btn-s sm" onClick={() => (cur.correctable ? onCorrect() : say(t('toast.correctNone')))}>صحّح آخر تسوية</button>
          <button type="button" className="btn btn-s sm" disabled={printing} onClick={async () => {
            setPrinting(true)
            const r = await api.printStatement(cur.id)
            setPrinting(false)
            if (!r.ok && r.error.code !== 'print_cancelled') say(errorText(r.error))
          }}>
            {printing && <span className="spin" aria-hidden="true" />}
            {printing ? 'جاري الطباعة' : 'اطبع الكشف'}
          </button>
        </div>
      </div>
      <div role="group" aria-label="كشف الحساب، قابل للتمرير" tabIndex={0} style={{ overflowX: 'auto' }}>
        <div role="table" aria-label="كشف الحساب" style={{ minWidth: 680 }}>
          <div role="row" className="ev head">
            <span role="columnheader">التاريخ</span><span role="columnheader">الحركة</span>
            <span role="columnheader" className="n">كروت</span><span role="columnheader" className="n">عليه</span>
            <span role="columnheader" className="n">دفع</span><span role="columnheader" className="n">الرصيد</span>
          </div>
          {cur.entries.filter((e) => !(e.type === 'opening' && e.chargeAg === 0)).map((e) => {
            const usage = e.type === 'usage'
            const isOpen = open === e.id
            return (
              <div key={e.id} style={{ display: 'contents' }}>
                <div role="row" className={e.id === newId ? 'ev new' : 'ev'}>
                  <span role="cell">{dateText(e.at)}</span>
                  <span role="cell">
                    {actionText(e)}
                    {e.corrected && <span className="sub"> (انصححت)</span>}
                    <span className="by sub small">{e.byName}</span>
                    {usage && (
                      <><br /><button type="button" className="btn btn-g sm lnk-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                        {isOpen ? 'إخفاء الكروت' : 'شوف الكروت'}
                      </button></>
                    )}
                  </span>
                  <span role="cell" className="n">{cardsCell(e.cardsDelta)}</span>
                  <span role="cell" className="n">{e.chargeAg ? formatSigned(e.chargeAg) : '—'}</span>
                  <span role="cell" className="n">{e.paidAg ? formatSigned(e.paidAg) : '—'}</span>
                  <strong role="cell" className="n">{formatBalance(e.balanceAg)}</strong>
                </div>
                {usage && isOpen && <UsageProof entryId={e.id} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── الشاشة

function SmallStat({ label, children, top }: { label: string; children: React.ReactNode; top?: boolean }) {
  return (
    <div className={top ? 'card top stat-sm' : 'card stat-sm'}>
      <div className="sub">{label}</div>
      <div className="stat-v">{children}</div>
    </div>
  )
}

export function Account() {
  const { state, dispatch } = useStore()
  const say = useToast()
  const data = useApi(() => api.account(state.distributorId), [state.distributorId])
  const [dlg, setDlg] = useState<DialogKind>(null)
  const [newId, setNewId] = useState<string | null>(null)
  const op = useOpKey()

  const changed = (entryId: string | null) => {
    setDlg(null)
    setNewId(entryId)
    dispatch({ type: 'changed' })
  }

  if (data.state === 'loading') return <StateView screen="account" mode="loading" />
  if (data.state === 'error') return <StateView screen="account" mode="error" onRetry={data.retry} />
  const { distributors, current: cur } = data.data

  const add = dlg === 'add' && (
    <AddDialog onCancel={() => setDlg(null)} onDone={(id, name) => {
      say(`انضاف ${name}.`)
      setDlg(null)
      dispatch({ type: 'go', screen: 'account', distributorId: id })
      dispatch({ type: 'changed' })
    }} />
  )

  if (!cur) {
    return (
      <div className="card scr state-empty">
        <h1>لسا ما أضفت موزعين</h1>
        <p>أضف أول موزع عشان تتابع كروته وحسابه.</p>
        <button type="button" className="btn btn-p" onClick={() => setDlg('add')}>أضف موزع</button>
        {add}
      </div>
    )
  }

  const sub = cur.area ? cur.area + '، ' : ''
  const settled = cur.daysSinceSettlement === null ? 'ما في تسوية لسا' : cur.daysSinceSettlement === 0 ? 'تسوية اليوم' : `آخر تسوية قبل ${daysText(cur.daysSinceSettlement)}`

  return (
    <div className="scr acc">
      <section aria-label="قائمة الموزعين" className="panel acc-list">
        <div className="panel-head"><strong>الموزعين</strong><button type="button" className="btn btn-s sm" onClick={() => setDlg('add')}>أضف موزع</button></div>
        {distributors.map((d) => (
          <button key={d.id} type="button" className={d.id === cur.id ? 'tr on' : 'tr'} aria-pressed={d.id === cur.id}
            onClick={() => { setNewId(null); dispatch({ type: 'go', screen: 'account', distributorId: d.id }) }}>
            <span>{d.name}</span><span className="m">{formatBalance(d.owedAg)}</span>
          </button>
        ))}
      </section>

      <section aria-labelledby="acc" className="acc-main">
        <header className="head" style={{ alignItems: 'center' }}>
          <div>
            <h1 id="acc" className="h1">{cur.name}</h1>
            <div className="sub acc-sub">
              <span>{sub}{settled}</span>
              <button type="button" className="btn btn-g sm limit-btn" onClick={() => setDlg('limit')}>سقف الدين <span className="m">{formatMoney(cur.creditLimitAg)}</span></button>
            </div>
          </div>
          <div className="row-btns">
            <button type="button" className="btn btn-s" onClick={() => setDlg('return')} disabled={cur.held === 0}>إرجاع كروت</button>
            <button type="button" className="btn btn-s" onClick={async () => {
              if (!cur.openDispute) return setDlg('dispute')
              const r = await api.closeDispute(cur.id, op.key())
              if (!r.ok) return say(errorText(r.error))
              op.renew()
              say('انسكر الخلاف، وضل مسجل بالكشف.')
              changed(r.value.entryId)
            }}>{cur.openDispute ? 'سكّر الخلاف' : 'افتح خلاف'}</button>
          </div>
        </header>

        {cur.openDispute && <div role="status" className="bn wa"><span>في خلاف مفتوح مع هذا الموزع. الرصيد ما تغير، والخلاف مسجل بالكشف.</span></div>}

        <div className="stats-sm">
          <SmallStat label="كروت عنده">{cur.held.toLocaleString('en-US')}</SmallStat>
          <SmallStat label="قيمة المستخدم"><span className="m">{formatMoney(cur.usedValueAg)}</span></SmallStat>
          <SmallStat label="محصّل"><span className="m">{formatMoney(cur.paidAg)}</span></SmallStat>
          <SmallStat label={cur.owedAg < 0 ? 'رصيد له' : 'مستحق عليه'} top><span className="m">{formatMoney(cur.owedAg)}</span></SmallStat>
        </div>

        <SettleForm key={cur.id} cur={cur} onSaved={(id) => changed(id)} />
        <Statement cur={cur} newId={newId} onCorrect={() => setDlg('correct')} />
      </section>

      {add}
      {dlg === 'limit' && <LimitDialog cur={cur} onCancel={() => setDlg(null)} onDone={(ag) => { say(`السقف صار ${formatMoney(ag)}.`); changed(null) }} />}
      {dlg === 'return' && <ReturnDialog cur={cur} onCancel={() => setDlg(null)} onDone={(n, up) => { say(t(up ? 'toast.returnUp' : 'toast.returnDown', { n })); changed(null) }} />}
      {dlg === 'dispute' && <DisputeDialog cur={cur} onCancel={() => setDlg(null)} onDone={(id) => changed(id)} />}
      {dlg === 'correct' && cur.correctable && <CorrectDialog cur={cur} onCancel={() => setDlg(null)} onDone={(id) => { say(t('toast.corrected')); changed(id) }} />}
    </div>
  )
}
