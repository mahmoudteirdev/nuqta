import { useState } from 'react'
import type { ReportsData, ReportTab } from '@shared/api'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { StateView } from '@/shell/StateView'
import { Tabs } from '@/shell/Tabs'
import { useToast } from '@/shell/Toast'

const TABS: { key: ReportTab; name: string }[] = [
  { key: 'collected', name: 'المحصّل مقابل المستخدم' },
  { key: 'commission', name: 'عمولة الموزعين' },
  { key: 'stale', name: 'كروت راكدة ومرتجعة' }
]

const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: 'آخر 7 أيام' },
  { days: 30, label: 'آخر 30 يوم' },
  { days: 90, label: 'آخر 90 يوم' },
  { days: null, label: 'من البداية' }
]

const dayMonth = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long' })
const pct = (paid: number, used: number) => (used ? Math.min(Math.round((paid / used) * 100), 100) : null)

function Collected({ r }: { r: ReportsData }) {
  const { dispatch } = useStore()
  const c = r.collected
  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <section aria-label="الملخص" className="sk-grid">
        <div className="card"><div className="sub">قيمة الكروت المستخدمة</div><div className="big"><span className="m">{formatMoney(c.usedAg)}</span></div></div>
        <div className="card"><div className="sub">وصلك منها</div><div className="big"><span className="m">{formatMoney(c.paidAg)}</span></div></div>
        <div className="card top"><div className="sub">لسا ما وصلك</div><div className="big"><span className="m">{formatMoney(c.owedAg)}</span></div></div>
      </section>
      <section aria-label="حسب الموزع" className="panel" tabIndex={0} style={{ overflowX: 'auto' }}>
        <div role="table" aria-label="حسب الموزع" style={{ minWidth: 760 }}>
          <div role="row" className="rep thead">
            <span role="columnheader">الموزع</span><span role="columnheader" className="n">المستخدم</span>
            <span role="columnheader" className="n">المحصّل</span><span role="columnheader" className="n">الفرق</span>
            <span role="columnheader">نسبة التحصيل</span>
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

function Commission({ r }: { r: ReportsData }) {
  return (
    <>
      <section className="panel scr" tabIndex={0} aria-label="عمولة الموزعين" style={{ overflowX: 'auto' }}>
        <div role="table" aria-label="عمولة الموزعين" style={{ minWidth: 560 }}>
          <div role="row" className="rowx thead" style={{ gridTemplateColumns: '1.6fr 1fr 1fr' }}>
            <span role="columnheader">الموزع</span><span role="columnheader">كروت مستخدمة</span><span role="columnheader">العمولة التقديرية</span>
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
      <p className="sub small" style={{ margin: 0 }}>العمولة هون فرق سعر البيع عن الجملة لكل كرت انستخدم، بسعر الدفعة اللي طلع منها.</p>
    </>
  )
}

function Stale({ r }: { r: ReportsData }) {
  const cols = { gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr' }
  return (
    <>
      <section className="panel scr" tabIndex={0} aria-label="كروت راكدة" style={{ overflowX: 'auto' }}>
        <div role="table" aria-label="كروت راكدة" style={{ minWidth: 640 }}>
          <div role="row" className="rowx thead" style={cols}>
            <span role="columnheader">الموزع</span><span role="columnheader">كروت عنده</span>
            <span role="columnheader">راكدة</span><span role="columnheader">مرتجعة</span><span role="columnheader">آخر تسليم</span>
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
      <p className="sub small" style={{ margin: 0 }}>الراكد: كرت انسلم من أكثر من {r.staleAfterDays} يوم ولسا ما انستخدم. هذا الجدول ما بيتأثر بالفترة.</p>
    </>
  )
}

export function Reports() {
  const say = useToast()
  const [tab, setTab] = useState<ReportTab>('collected')
  const [days, setDays] = useState<number | null>(30)
  const [busy, setBusy] = useState(false)
  const data = useApi(() => api.reports(days), [days])

  if (data.state === 'loading') return <StateView screen="reports" mode="loading" />
  if (data.state === 'error') return <StateView screen="reports" mode="error" onRetry={data.retry} />
  const r = data.data
  const period = PERIODS.find((p) => p.days === days)!.label

  if (!r.collected.rows.length) return <StateView screen="reports" mode="empty" />

  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <header className="head" style={{ alignItems: 'center', gap: 16 }}>
        <div>
          <h1 className="h1">التقارير</h1>
          <div className="sub">{tab === 'stale' ? 'الوضع الحالي' : `${period}، بسعر الجملة`}</div>
        </div>
        <div className="row-btns">
          <div className="box period"><select aria-label="الفترة" value={String(days)} onChange={(e) => setDays(e.target.value === 'null' ? null : Number(e.target.value))}>
            {PERIODS.map((p) => <option key={String(p.days)} value={String(p.days)}>{p.label}</option>)}
          </select></div>
          <button type="button" className="btn btn-s" disabled={busy} onClick={async () => {
            setBusy(true)
            const res = await api.exportReport(tab, days)
            setBusy(false)
            if (!res.ok) return say('ما قدرنا نحفظ الملف.')
            if ('path' in res.value) say('انحفظ ملف Excel للتقرير.')
          }}>تصدير Excel</button>
          <button type="button" className="btn btn-s" disabled={busy} onClick={async () => {
            setBusy(true)
            const res = await api.exportReportPdf(tab, days)
            setBusy(false)
            if (!res.ok) return say('ما قدرنا نحفظ الملف.')
            if ('path' in res.value) say('انحفظ ملف PDF للتقرير.')
          }}>تصدير PDF</button>
        </div>
      </header>
      <Tabs label="التقارير" tabs={TABS} current={tab} onChange={setTab}>
        {tab === 'collected' && <Collected r={r} />}
        {tab === 'commission' && <Commission r={r} />}
        {tab === 'stale' && <Stale r={r} />}
      </Tabs>
    </div>
  )
}
