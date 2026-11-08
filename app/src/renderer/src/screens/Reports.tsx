import { useState } from 'react'
import type { ReportsData, ReportTab } from '@shared/api'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { StateView } from '@/shell/StateView'
import { Tabs } from '@/shell/Tabs'
import { useToast } from '@/shell/Toast'

const TAB_DEFS: { key: ReportTab; nameKey: string }[] = [
  { key: 'collected', nameKey: 'reports.tabCollected' },
  { key: 'commission', nameKey: 'reports.tabCommission' },
  { key: 'stale', nameKey: 'reports.tabStale' }
]

const PERIOD_DEFS: { days: number | null; labelKey: string }[] = [
  { days: 7, labelKey: 'reports.p7' },
  { days: 30, labelKey: 'reports.p30' },
  { days: 90, labelKey: 'reports.p90' },
  { days: null, labelKey: 'reports.all' }
]

const pct = (paid: number, used: number) => (used ? Math.min(Math.round((paid / used) * 100), 100) : null)

function Collected({ r, isEn }: { r: ReportsData; isEn: boolean }) {
  const { dispatch } = useStore()
  const c = r.collected
  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <section aria-label={isEn ? 'Summary' : 'الملخص'} className="sk-grid">
        <div className="card"><div className="sub">{isEn ? 'Used cards value' : 'قيمة الكروت المستخدمة'}</div><div className="big"><span className="m">{formatMoney(c.usedAg)}</span></div></div>
        <div className="card"><div className="sub">{isEn ? 'Collected' : 'وصلك منها'}</div><div className="big"><span className="m">{formatMoney(c.paidAg)}</span></div></div>
        <div className="card top"><div className="sub">{isEn ? 'Uncollected' : 'لسا ما وصلك'}</div><div className="big"><span className="m">{formatMoney(c.owedAg)}</span></div></div>
      </section>
      <section aria-label={isEn ? 'By distributor' : 'حسب الموزع'} className="panel" tabIndex={0} style={{ overflowX: 'auto' }}>
        <div role="table" aria-label={isEn ? 'By distributor' : 'حسب الموزع'} style={{ minWidth: 760 }}>
          <div role="row" className="rep thead">
            <span role="columnheader">{isEn ? 'Distributor' : 'الموزع'}</span><span role="columnheader" className="n">{isEn ? 'Used' : 'المستخدم'}</span>
            <span role="columnheader" className="n">{isEn ? 'Collected' : 'المحصّل'}</span><span role="columnheader" className="n">{isEn ? 'Difference' : 'الفرق'}</span>
            <span role="columnheader">{isEn ? 'Collection Rate' : 'نسبة التحصيل'}</span>
          </div>
          {c.rows.map((x) => {
            const p = pct(x.paidAg, x.usedAg)
            return (
              <div key={x.id} role="row" className="rep">
                <span role="cell" style={{ display: 'contents' }}>
                  <button type="button" className="lnk" onClick={() => dispatch({ type: 'go', screen: 'account', distributorId: x.id })}>{x.name}</button>
                </span>
                <span role="cell" className="n">{formatMoney(x.usedAg)}</span>
                <span role="cell" className="n">{formatMoney(x.paidAg)}</span>
                <strong role="cell" className="n">{formatMoney(x.owedAg)}</strong>
                <span role="cell" style={{ display: 'contents' }}>
                  <div className="pct">
                    <span className="pct-n">{p === null ? '—' : `${p}%`}</span>
                    <div className="bar" aria-hidden="true"><span style={{ width: `${p ?? 0}%` }} /></div>
                  </div>
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Commission({ r, isEn }: { r: ReportsData; isEn: boolean }) {
  return (
    <>
      <section className="panel scr" tabIndex={0} aria-label={isEn ? 'Distributor commission' : 'عمولة الموزعين'} style={{ overflowX: 'auto' }}>
        <div role="table" aria-label={isEn ? 'Distributor commission' : 'عمولة الموزعين'} style={{ minWidth: 560 }}>
          <div role="row" className="rowx thead" style={{ gridTemplateColumns: '1.6fr 1fr 1fr' }}>
            <span role="columnheader">{isEn ? 'Distributor' : 'الموزع'}</span><span role="columnheader">{isEn ? 'Used cards' : 'كروت مستخدمة'}</span><span role="columnheader">{isEn ? 'Estimated commission' : 'العمولة التقديرية'}</span>
          </div>
          {r.commission.map((x) => (
            <div key={x.id} role="row" className="rowx" style={{ gridTemplateColumns: '1.6fr 1fr 1fr' }}>
              <span role="cell">{x.name}</span>
              <span role="cell">{x.cards.toLocaleString('en-US')}</span>
              <strong role="cell" className="m" style={{ justifySelf: 'start' }}>{formatMoney(x.commissionAg)}</strong>
            </div>
          ))}
        </div>
      </section>
      <p className="sub small" style={{ margin: 0 }}>
        {isEn
          ? 'Commission is the difference between retail and wholesale price per card used, at the batch price.'
          : 'العمولة هون فرق سعر البيع عن الجملة لكل كرت انستخدم، بسعر الدفعة اللي طلع منها.'}
      </p>
    </>
  )
}

function Stale({ r, isEn, dayMonth }: { r: ReportsData; isEn: boolean; dayMonth: Intl.DateTimeFormat }) {
  const cols = { gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr' }
  return (
    <>
      <section className="panel scr" tabIndex={0} aria-label={isEn ? 'Stale cards' : 'كروت راكدة'} style={{ overflowX: 'auto' }}>
        <div role="table" aria-label={isEn ? 'Stale cards' : 'كروت راكدة'} style={{ minWidth: 640 }}>
          <div role="row" className="rowx thead" style={cols}>
            <span role="columnheader">{isEn ? 'Distributor' : 'الموزع'}</span><span role="columnheader">{isEn ? 'Held cards' : 'كروت عنده'}</span>
            <span role="columnheader">{isEn ? 'Stale' : 'راكدة'}</span><span role="columnheader">{isEn ? 'Returned' : 'مرتجعة'}</span><span role="columnheader">{isEn ? 'Last delivery' : 'آخر تسليم'}</span>
          </div>
          {r.stale.map((x) => (
            <div key={x.id} role="row" className="rowx" style={cols}>
              <span role="cell">{x.name}</span>
              <span role="cell">{x.held.toLocaleString('en-US')}</span>
              <span role="cell" className={x.staleCards ? 'warn-text' : undefined}>{x.staleCards.toLocaleString('en-US')}</span>
              <span role="cell">{x.returned.toLocaleString('en-US')}</span>
              <span role="cell">{x.lastDeliveryAt ? dayMonth.format(new Date(x.lastDeliveryAt)) : '—'}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="sub small" style={{ margin: 0 }}>
        {isEn
          ? `Stale: cards delivered over ${r.staleAfterDays} days ago and not yet used. This table is not affected by period.`
          : `الراكد: كرت انسلم من أكثر من ${r.staleAfterDays} يوم ولسا ما انستخدم. هذا الجدول ما بيتأثر بالفترة.`}
      </p>
    </>
  )
}

export function Reports() {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [tab, setTab] = useState<ReportTab>('collected')
  const [days, setDays] = useState<number | null>(30)
  const [busy, setBusy] = useState(false)
  const data = useApi(() => api.reports(days), [days])

  const dayMonth = new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { day: 'numeric', month: 'long' })

  if (data.state === 'loading') return <StateView screen="reports" mode="loading" />
  if (data.state === 'error') return <StateView screen="reports" mode="error" onRetry={data.retry} />
  const r = data.data
  const periodObj = PERIOD_DEFS.find((p) => p.days === days)!
  const periodLabel = t(periodObj.labelKey)

  if (!r.collected.rows.length) return <StateView screen="reports" mode="empty" />

  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <header className="head" style={{ alignItems: 'center', gap: 16 }}>
        <div>
          <h1 className="h1">{t('reports.title')}</h1>
          <div className="sub">{tab === 'stale' ? (isEn ? 'Current state' : 'الوضع الحالي') : (isEn ? `${periodLabel}, at wholesale price` : `${periodLabel}، بسعر الجملة`)}</div>
        </div>
        <div className="row-btns">
          <div className="box period"><select aria-label={isEn ? 'Period' : 'الفترة'} value={String(days)} onChange={(e) => setDays(e.target.value === 'null' ? null : Number(e.target.value))}>
            {PERIOD_DEFS.map((p) => <option key={String(p.days)} value={String(p.days)}>{t(p.labelKey)}</option>)}
          </select></div>
          <button type="button" className="btn btn-s" disabled={busy} onClick={async () => {
            setBusy(true)
            const res = await api.exportReport(tab, days)
            setBusy(false)
            if (!res.ok) return say(isEn ? 'Could not save file.' : 'ما قدرنا نحفظ الملف.')
            if ('path' in res.value) say(isEn ? 'Excel report saved.' : 'انحفظ ملف Excel للتقرير.')
          }}>{isEn ? 'Export Excel' : 'تصدير Excel'}</button>
          <button type="button" className="btn btn-s" disabled={busy} onClick={async () => {
            setBusy(true)
            const res = await api.exportReportPdf(tab, days)
            setBusy(false)
            if (!res.ok) return say(isEn ? 'Could not save file.' : 'ما قدرنا نحفظ الملف.')
            if ('path' in res.value) say(isEn ? 'PDF report saved.' : 'انحفظ ملف PDF للتقرير.')
          }}>{isEn ? 'Export PDF' : 'تصدير PDF'}</button>
        </div>
      </header>
      <Tabs label={isEn ? 'Reports' : 'التقارير'} tabs={TAB_DEFS.map((d) => ({ key: d.key, name: t(d.nameKey) }))} current={tab} onChange={setTab}>
        {tab === 'collected' && <Collected r={r} isEn={isEn} />}
        {tab === 'commission' && <Commission r={r} isEn={isEn} />}
        {tab === 'stale' && <Stale r={r} isEn={isEn} dayMonth={dayMonth} />}
      </Tabs>
    </div>
  )
}
