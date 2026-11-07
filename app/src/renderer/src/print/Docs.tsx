// المستندات المطبوعة: ورقة الكروت، كشف الحساب، والتقرير. بالمليمتر عشان الورق يطلع مزبوط.

import type { CardsJob, ReportJob, StatementJob } from '@shared/print'
import { formatBalance, formatMoney, formatSigned } from '@/lib/format'
import { actionText, cardsCell, dateText } from '@/lib/statement'

const PER_PAGE = { 'a4-12': 12, 'a4-24': 24, thermal: 1 } as const

const printedText = (iso: string) =>
  new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** ورقة الكروت. كل صفحة لحالها عشان الكرت ما ينقسم بين صفحتين. */
export function CardsDoc({ job }: { job: CardsJob }) {
  return (
    <div className={`cards t-${job.template}`}>
      {chunk(job.codes, PER_PAGE[job.template]).map((page, i) => (
        <section key={i} className="page">
          {page.map((code) => (
            <article key={code} className="pc">
              <div className="pc-top"><span>{job.networkName}</span><span>{job.categoryName}</span></div>
              <div className="pc-code" dir="ltr">{code}</div>
              <div className="pc-foot">
                <span>افتح الواي فاي وادخل الكود</span>
                {job.showPrice && <strong className="m">{formatMoney(job.saleAg)}</strong>}
              </div>
              <div className="pc-meta">
                <span dir="ltr">B-{job.batchNo}</span>
                {job.phone && <span dir="ltr">{job.phone}</span>}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}

export function StatementDoc({ job }: { job: StatementJob }) {
  let lastBalance = 0
  return (
    <div className="doc">
      <header className="doc-head">
        <div>
          <div className="doc-net">{job.networkName}</div>
          <h1>كشف حساب: {job.distributorName}</h1>
          {job.area && <div className="doc-sub">{job.area}</div>}
        </div>
        <div className="doc-sub">انطبع {printedText(job.printedAt)}</div>
      </header>
      <section className="doc-sum">
        <div><span>كروت عنده</span><strong>{job.held.toLocaleString('en-US')}</strong></div>
        <div><span>قيمة المستخدم</span><strong className="m">{formatMoney(job.usedValueAg)}</strong></div>
        <div><span>محصّل</span><strong className="m">{formatMoney(job.paidAg)}</strong></div>
        <div className="doc-owed"><span>{job.owedAg < 0 ? 'رصيد له' : 'مستحق عليه'}</span><strong className="m">{formatMoney(job.owedAg)}</strong></div>
        <div><span>سقف الدين</span><strong className="m">{formatMoney(job.creditLimitAg)}</strong></div>
      </section>
      <table className="doc-table">
        <thead>
          <tr><th>التاريخ</th><th>الحركة</th><th className="n">كروت</th><th className="n">عليه</th><th className="n">دفع</th><th className="n">الرصيد</th></tr>
        </thead>
        <tbody>
          {job.entries.map((e) => {
            lastBalance = e.balanceAg
            return (
              <tr key={e.id}>
                <td>{dateText(e.at)}</td>
                <td>{actionText(e)}{e.corrected ? ' (انصححت)' : ''}</td>
                <td className="n">{cardsCell(e.cardsDelta)}</td>
                <td className="n">{e.chargeAg ? formatSigned(e.chargeAg) : '—'}</td>
                <td className="n">{e.paidAg ? formatSigned(e.paidAg) : '—'}</td>
                <td className="n"><strong>{formatBalance(e.balanceAg)}</strong></td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={5}>الرصيد الحالي</td><td className="n"><strong>{formatBalance(lastBalance)}</strong></td></tr>
        </tfoot>
      </table>
      <p className="doc-note">الدفتر ما بينحذف منه شي: أي تصحيح بيظهر كحركة عكسية مربوطة بالأصلية.</p>
    </div>
  )
}

export function ReportDoc({ job }: { job: ReportJob }) {
  const num = new Set(job.numeric)
  return (
    <div className="doc">
      <header className="doc-head">
        <div>
          <div className="doc-net">{job.networkName}</div>
          <h1>{job.title}</h1>
          <div className="doc-sub">{job.subtitle}</div>
        </div>
        <div className="doc-sub">انطبع {printedText(job.printedAt)}</div>
      </header>
      <table className="doc-table">
        <thead><tr>{job.columns.map((c, i) => <th key={c} className={num.has(i) ? 'n' : undefined}>{c}</th>)}</tr></thead>
        <tbody>
          {job.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={num.has(j) ? 'n' : undefined}>{c}</td>)}</tr>)}
        </tbody>
        {job.footer && <tfoot><tr>{job.footer.map((c, j) => <td key={j} className={num.has(j) ? 'n' : undefined}><strong>{c}</strong></td>)}</tr></tfoot>}
      </table>
    </div>
  )
}
