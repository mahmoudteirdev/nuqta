import { useEffect, useRef, useState } from 'react'
import type { BatchForm, BatchView } from '@shared/api'
import { num } from '@shared/input'
import { api } from '@/lib/api'
import { errorText, useOpKey } from '@/lib/actions'
import { cardsText, formatMoney } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from '@/shell/Dialog'
import { StateView } from '@/shell/StateView'
import { Tabs } from '@/shell/Tabs'
import { useToast } from '@/shell/Toast'
import { TEMPLATE_INFO, Voucher } from '@/shell/Voucher'
import { BatchLog } from './cards/BatchLog'
import { Prices } from './cards/Prices'
import { Templates } from './cards/Templates'

type Tab = 'gen' | 'batches' | 'prices' | 'templates'
const TABS: { key: Tab; name: string }[] = [
  { key: 'gen', name: 'توليد دفعة' },
  { key: 'batches', name: 'الدفعات' },
  { key: 'prices', name: 'الفئات والأسعار' },
  { key: 'templates', name: 'قوالب الطباعة' }
]

const DIRECT = 'direct'

function Generate({ form }: { form: BatchForm }) {
  const { state, dispatch } = useStore()
  const say = useToast()
  const createOp = useOpKey()
  const deliverOp = useOpKey()

  const [routerId, setRouterId] = useState(form.routers[0]?.id ?? 0)
  const [categoryId, setCategoryId] = useState(form.categories[1]?.id ?? form.categories[0]?.id ?? 0)
  const [count, setCount] = useState('100')
  const [dist, setDist] = useState<string>(state.distributorId ?? form.distributors[0]?.id ?? DIRECT)
  const [countErr, setCountErr] = useState('')

  const [batch, setBatch] = useState<BatchView | null>(null)
  const [sending, setSending] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState<{ n: number; name: string } | null>(null)
  const [dlg, setDlg] = useState<'limit' | 'check' | null>(null)
  const [dlgBusy, setDlgBusy] = useState(false)
  const [dlgErr, setDlgErr] = useState('')
  const printBtn = useRef<HTMLButtonElement>(null)

  // الدفعة المفتوحة من شغل اليوم («أكمل دفعة بالانتظار») أو من قبل.
  useEffect(() => {
    if (state.batchId === null) return
    void api.batchView(state.batchId).then((v) => {
      if (!v) return
      setBatch(v)
      setRouterId(v.routerId)
      setCategoryId(v.categoryId)
      setCount(String(v.count))
      setDist(v.distributorId ?? DIRECT)
    })
  }, [state.batchId])

  const cat = form.categories.find((c) => c.id === categoryId)
  const d = form.distributors.find((x) => x.id === dist)
  const router = form.routers.find((r) => r.id === routerId)
  const n = Math.floor(num(count)) || 0
  const overLimit = d && d.owedAg > d.creditLimitAg
  const stage = sending ? 'sending' : batch ? (batch.stage === 'done' ? 'done' : 'sent') : 'form'
  const locked = stage !== 'form'
  const network = state.status?.networkName ?? ''
  const distName = d?.name ?? 'البيع المباشر'
  const expired = state.status?.license.state === 'expired'

  const refresh = async (v: BatchView) => {
    setBatch(v)
    dispatch({ type: 'go', screen: 'batch', batchId: v.id })
    dispatch({ type: 'changed' })
    dispatch({ type: 'status', status: await api.status() })
  }

  const beginSend = async () => {
    setDlg(null)
    setSending(true)
    setNote('')
    setDone(null)
    const r = await api.createBatch({ routerId, categoryId, distributorId: dist === DIRECT ? null : dist, count: n }, createOp.key())
    setSending(false)
    if (!r.ok) return setCountErr(errorText(r.error))
    createOp.renew()
    await refresh(r.value.view)
  }

  const send = () => {
    const raw = num(count)
    if (!(raw > 0) || raw !== Math.floor(raw)) return setCountErr(t('err.count'))
    if (raw > form.maxCount) return setCountErr(`أكبر دفعة ${form.maxCount.toLocaleString('en-US')} كرت، لحد ما نجرب أكثر على الراوتر.`)
    if (overLimit) return setDlg('limit')
    void beginSend()
  }

  const resend = async () => {
    if (!batch) return
    setResendBusy(true)
    setNote('')
    const r = await api.resendBatch(batch.id)
    setResendBusy(false)
    if (!r.ok) return setNote(errorText(r.error))
    if (r.value.routerDown) setNote(t('batch.resendDown'))
    await refresh(r.value.view)
  }

  const print = async (scope: 'new' | 'again') => {
    if (!batch) return
    setPrintBusy(true)
    const r = await api.printBatch(batch.id, scope)
    setPrintBusy(false)
    if (!r.ok) return say(errorText(r.error))
    setBatch(r.value)
    setDlgErr('')
    setDlg('check')
  }

  const deliver = async () => {
    if (!batch) return
    setDlgBusy(true)
    const r = await api.deliverBatch(batch.id, deliverOp.key())
    setDlgBusy(false)
    if (!r.ok) return setDlgErr(errorText(r.error))
    deliverOp.renew()
    setDlg(null)
    setDone({ n: r.value.delivered, name: distName })
    if (r.value.view.pending > 0) setNote(`انسلم ${cardsText(r.value.delivered)}. باقي ${cardsText(r.value.view.pending)} بالانتظار.`)
    say(t('toast.delivered', { n: r.value.delivered, name: distName }))
    await refresh(r.value.view)
  }

  const newBatch = () => {
    setBatch(null)
    setDone(null)
    setNote('')
    setCount('100')
    createOp.renew()
    dispatch({ type: 'go', screen: 'batch', batchId: null })
  }

  const confirmed = batch ? batch.count - batch.pending : 0
  const doneBody = !done ? '' : dist === DIRECT ? `${cardsText(done.n)} بيع مباشر.`
    : d?.debtPolicy === 'on_delivery' ? `${cardsText(done.n)} عهدة على ${done.name}، وانحسب دينها عليه.`
    : t('batch.done.body', { n: done.n, name: done.name })

  return (
    <div className="scr gen">
      <section aria-label="إعدادات الدفعة" className="card gen-form">
        <div className="fld">
          <label className="lbl" htmlFor="br">الراوتر</label>
          <div className="box"><select id="br" value={routerId} disabled={locked} onChange={(e) => setRouterId(Number(e.target.value))}>
            {form.routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></div>
        </div>
        <div className="fld">
          <span className="lbl" id="cl">الفئة</span>
          <div role="group" aria-labelledby="cl" className="chips">
            {form.categories.map((c) => (
              <button key={c.id} type="button" className={c.id === categoryId ? 'chip on' : 'chip'} aria-pressed={c.id === categoryId}
                disabled={locked} onClick={() => setCategoryId(c.id)}>
                <strong>{c.name}</strong>
                <span>جملة <span className="m">{formatMoney(c.wholeAg)}</span>، بيع <span className="m">{formatMoney(c.saleAg)}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="fld">
          <label className="lbl" htmlFor="bn">العدد</label>
          <div className={countErr ? 'box err' : 'box'}>
            <input id="bn" inputMode="numeric" value={count} disabled={locked} aria-invalid={!!countErr} aria-describedby={countErr ? 'bnE' : undefined}
              onChange={(e) => { setCount(e.target.value); setCountErr('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
          </div>
          {countErr && <span id="bnE" className="emsg" role="alert">{countErr}</span>}
        </div>
        <div className="fld">
          <label className="lbl" htmlFor="bd">الموزع</label>
          <div className="box"><select id="bd" value={dist} disabled={locked} onChange={(e) => setDist(e.target.value)}>
            {form.distributors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value={DIRECT}>بيع مباشر</option>
          </select></div>
          {!locked && overLimit && d && <span className="warn-text">عليه {formatMoney(d.owedAg)}، فوق السقف {formatMoney(d.creditLimitAg)}.</span>}
        </div>
        <div className="gen-total">
          <span>قيمة الدفعة بالجملة</span>
          <strong className="m">{formatMoney((cat?.wholeAg ?? 0) * (batch?.count ?? n))}</strong>
        </div>
        {stage === 'form' && expired && (
          <div className="bn er" role="alert">
            <span><strong>انتهت التجربة.</strong> فعّل البرنامج عشان تولّد كروت جديدة. الحسابات شغالة عادي.</span>
            <button type="button" className="btn btn-s sm" onClick={() => dispatch({ type: 'go', screen: 'settings', settingsTab: 'license' })}>فعّل البرنامج</button>
          </div>
        )}
        {stage === 'form' && <button type="button" className="btn btn-p" disabled={expired} onClick={send}>ولّد وأرسل للراوتر</button>}
        {(stage === 'sent' || stage === 'done') && <button type="button" className="btn btn-s" onClick={newBatch}>دفعة جديدة</button>}
      </section>

      <section aria-label="التأكيد والطباعة" className="gen-side">
        {stage === 'sending' && (
          <div className="card scr" role="status">
            <strong>جاري الإرسال للراوتر</strong>
            <div className="bar indeterminate" style={{ marginTop: 10 }}><span /></div>
          </div>
        )}

        {batch && stage === 'sent' && (
          <div role="status" className={batch.pending > 0 ? 'bn wa scr gen-status' : 'bn ok scr gen-status'}>
            <div>
              <strong className="gen-status-title">
                {batch.pending > 0
                  ? t('batch.partial.title', { router: batch.routerName, ok: confirmed, total: batch.count })
                  : `${batch.routerName} أكد كل الكروت`}
              </strong>
              {note || (batch.pending > 0 ? t('batch.partial.body', { n: batch.pending }) : 'الدفعة جاهزة للطباعة.')}
            </div>
            {batch.pending > 0 && (
              <button type="button" className="btn btn-s" disabled={resendBusy} onClick={() => void resend()}>
                {resendBusy && <span className="spin" aria-hidden="true" />}
                {resendBusy ? 'جاري الإرسال' : `أعد إرسال ${cardsText(batch.pending)}`}
              </button>
            )}
          </div>
        )}

        {done && (
          <div role="status" className="bn ok scr"><span><strong>انسجلت دفعة B-{batch?.no}.</strong> {doneBody}</span></div>
        )}

        <div className="card gen-preview">
          <div className="head" style={{ alignItems: 'center' }}>
            <div>
              <h2 className="h2">معاينة الطباعة</h2>
              <span className="sub small">{TEMPLATE_INFO[form.template].page}</span>
            </div>
            {batch && stage === 'sent' && (
              batch.toPrint > 0 || batch.toDeliver === 0 ? (
                <button ref={printBtn} type="button" className="btn btn-p" disabled={batch.toPrint === 0 || printBusy} onClick={() => void print('new')}>
                  {printBusy && <span className="spin" aria-hidden="true" />}
                  {printBusy ? 'جاري الطباعة' : `اطبع ${cardsText(batch.toPrint)}`}
                </button>
              ) : (
                <button ref={printBtn} type="button" className="btn btn-p" onClick={() => setDlg('check')}>{`سلّم ${cardsText(batch.toDeliver)}`}</button>
              )
            )}
          </div>
          <div className="vc-grid">
            {batch
              ? batch.preview.map((v) => (
                  <Voucher key={v.code} network={network} category={batch.categoryName} code={v.code}
                    foot={v.ready ? formatMoney(batch.saleAg) : 'بالانتظار'} waiting={!v.ready} />
                ))
              : Array.from({ length: 6 }, (_, i) => (
                  <Voucher key={i} network={network} category={cat?.name ?? ''} code="XXXX-XXXX" foot={formatMoney(cat?.saleAg ?? 0)} waiting />
                ))}
          </div>
        </div>
      </section>

      {dlg === 'limit' && d && (
        <Dialog title={t('dlg.overLimit.title', { name: d.name })} okLabel={t('dlg.overLimit.ok')}
          body={t('dlg.overLimit.body', { owed: formatMoney(d.owedAg), limit: formatMoney(d.creditLimitAg) })}
          onCancel={() => setDlg(null)} onOk={() => void beginSend()} />
      )}
      {dlg === 'check' && batch && (
        <Dialog title={t('dlg.printCheck.title')} okLabel={t('dlg.printCheck.ok')} cancelLabel="" busy={dlgBusy || printBusy} error={dlgErr}
          body={t('dlg.printCheck.body', { n: batch.printedTimes })} returnTo={printBtn}
          secondary={{ label: t('dlg.printCheck.cancel'), onClick: () => void print('again') }}
          onCancel={() => setDlg(null)} onOk={() => void deliver()} />
      )}
    </div>
  )
}

export function Batch() {
  const { dispatch } = useStore()
  const [tab, setTab] = useState<Tab>('gen')
  const form = useApi(() => api.batchForm())
  if (form.state === 'loading') return <StateView screen="batch" mode="loading" />
  if (form.state === 'error') return <StateView screen="batch" mode="error" onRetry={form.retry} />
  if (!form.data.categories.length) return <StateView screen="batch" mode="empty" />
  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <h1 className="h1">الكروت</h1>
      <Tabs label="أقسام الكروت" tabs={TABS} current={tab} onChange={setTab}>
        {tab === 'gen' && <Generate form={form.data} />}
        {tab === 'batches' && <BatchLog openBatch={(id) => { dispatch({ type: 'go', screen: 'batch', batchId: id }); setTab('gen') }} />}
        {tab === 'prices' && <Prices />}
        {tab === 'templates' && <Templates />}
      </Tabs>
    </div>
  )
}
