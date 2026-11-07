import { useState } from 'react'
import type { BatchLogRow } from '@shared/api'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from '@/shell/Dialog'
import { useToast } from '@/shell/Toast'

const COLS = { gridTemplateColumns: '.8fr 1fr 1.6fr 1fr .9fr auto' }

/** سجل الدفعات وإعادة الطباعة بنفس الأكواد. */
export function BatchLog({ openBatch }: { openBatch: (id: number) => void }) {
  const { dispatch } = useStore()
  const say = useToast()
  const log = useApi(() => api.batchLog())
  const [target, setTarget] = useState<BatchLogRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (log.state === 'loading') return <div className="panel"><div className="pad"><span className="sk" style={{ width: '60%' }} /></div></div>
  if (log.state === 'error') return <div className="card"><span className="emsg">ما قدرنا نجيب الدفعات.</span> <button type="button" className="lnk" onClick={log.retry}>أعد المحاولة</button></div>

  return (
    <section className="panel scr" aria-label="الدفعات، قابل للتمرير" tabIndex={0} style={{ overflowX: 'auto' }}>
      <div role="table" aria-label="الدفعات" style={{ minWidth: 760 }}>
        <div role="row" className="rowx thead" style={COLS}>
          <span role="columnheader">الدفعة</span><span role="columnheader">الفئة</span><span role="columnheader">الموزع</span>
          <span role="columnheader">مستخدم</span><span role="columnheader">انطبعت</span>
          <span role="columnheader" className="act-col"><span className="sr">إجراء</span></span>
        </div>
        {log.data.map((b) => (
          <div key={b.id} role="row" className="rowx" style={COLS}>
            <span role="cell" dir="ltr" className="mono-in batch-no">B-{b.no}</span>
            <span role="cell">{b.categoryName}</span>
            <span role="cell">{b.distributorName ?? 'بيع مباشر'}</span>
            <span role="cell">{b.used.toLocaleString('en-US')} من {b.count.toLocaleString('en-US')}{b.pending > 0 && <span className="warn-text"> ({b.pending} بالانتظار)</span>}</span>
            <span role="cell">{b.printedTimes} مرة</span>
            <span role="cell" style={{ display: 'contents' }}>
              {b.stage === 'sent' && b.pending > 0
                ? <button type="button" className="btn btn-s sm act-col" onClick={() => openBatch(b.id)}>كمّلها</button>
                : <button type="button" className="btn btn-s sm act-col" disabled={!b.printable} onClick={() => { setErr(''); setTarget(b) }}>اطبع ثاني</button>}
            </span>
          </div>
        ))}
        {!log.data.length && <div className="empty-row">لسا ما ولّدت أي دفعة.</div>}
      </div>

      {target && (
        <Dialog title={t('dlg.reprint.title', { no: `B-${target.no}` })} okLabel="اطبع" busy={busy} busyLabel="جاري الطباعة" error={err}
          body={t('dlg.reprint.body')} onCancel={() => setTarget(null)}
          onOk={async () => {
            setBusy(true)
            const r = api.reprintBatch(target.id)
            const res = await r
            setBusy(false)
            if (!res.ok) return setErr(errorText(res.error))
            setTarget(null)
            say(`انسجلت إعادة طباعة B-${target.no}.`)
            dispatch({ type: 'changed' })
          }} />
      )}
    </section>
  )
}
