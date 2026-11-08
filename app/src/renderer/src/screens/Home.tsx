import type { HomeData, HomeTask } from '@shared/api'
import { api } from '@/lib/api'
import { cardsText, daysText, formatMoney, todayText } from '@/lib/format'
import { t } from '@/lib/i18n'
import { EMPTY } from '@/lib/screens'
import { useStore, type Action } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { StateView } from '@/shell/StateView'

interface TaskView {
  key: string
  title: string
  detail: string
  label: string
  go: Action
}

function taskView(k: HomeTask): TaskView {
  switch (k.kind) {
    case 'router':
      return { key: 'router', title: t('home.task.router'), detail: 'ما بيرد من شوي', label: 'افتح الشبكة', go: { type: 'go', screen: 'network' } }
    case 'pending':
      return {
        key: `pending:${k.batchId}`, title: t('home.task.pending'), detail: `${cardsText(k.pending)} من الدفعة B-${k.batchNo} ما أكدها الراوتر`,
        label: 'افتح الدفعة', go: { type: 'go', screen: 'batch', batchId: k.batchId }
      }
    case 'collect':
      return {
        key: `collect:${k.distributorId}`, title: t('home.task.collect', { name: k.name }),
        detail: `${formatMoney(k.owedAg)}، آخر تسوية قبل ${daysText(k.days)}`,
        label: 'افتح الحساب', go: { type: 'go', screen: 'account', distributorId: k.distributorId }
      }
    case 'stock':
      return {
        key: `stock:${k.distributorId}:${k.categoryName}`, title: `اشحن كروت ل${k.name}`,
        detail: k.held ? `باقي ${cardsText(k.held)} من فئة ${k.categoryName}` : `خلصت كروت فئة ${k.categoryName}`,
        label: 'ولّد دفعة', go: { type: 'go', screen: 'batch', distributorId: k.distributorId, batchId: null }
      }
    case 'dispute':
      return {
        key: `dispute:${k.distributorId}`, title: t('home.task.dispute', { name: k.name }),
        detail: k.days === 0 ? 'مفتوح اليوم' : `مفتوح من ${daysText(k.days)}`,
        label: 'افتح الحساب', go: { type: 'go', screen: 'account', distributorId: k.distributorId }
      }
  }
}

function Stat({ label, value, top }: { label: string; value: number; top?: boolean }) {
  return (
    <div className={top ? 'card top' : 'card'}>
      <div className="sub">{label}</div>
      <div className="big"><span className="m">{formatMoney(value)}</span></div>
    </div>
  )
}

function Tasks({ tasks }: { tasks: HomeTask[] }) {
  const { dispatch } = useStore()
  if (!tasks.length) {
    return (
      <div className="card scr empty-tasks">
        <strong>{EMPTY.home.title}</strong>
        <span className="sub">{EMPTY.home.body}</span>
      </div>
    )
  }
  return (
    <>
      {tasks.map(taskView).map((k, i) => (
        <div key={k.key} className={i === 0 ? 'card top task' : 'card task'}>
          <div>
            <strong>{k.title}</strong>
            <span className="sub">{k.detail}</span>
          </div>
          <button type="button" className={i === 0 ? 'btn btn-p' : 'btn btn-s'} onClick={() => dispatch(k.go)}>{k.label}</button>
        </div>
      ))}
    </>
  )
}

function UsageToday({ rows }: { rows: HomeData['usageToday'] }) {
  const max = Math.max(...rows.map((r) => r.valueAg), 1)
  return (
    <aside className="card usage" aria-labelledby="sold">
      <h2 id="sold" className="h2">الاستخدام اليوم حسب الموزع</h2>
      {!rows.length && <span className="sub">لسا ما انستخدم أي كرت اليوم.</span>}
      {rows.map((r) => (
        <div key={r.distributorId ?? 'direct'}>
          <div className="usage-row">
            <span>{r.name ?? 'بيع مباشر'}</span>
            <strong className="m">{formatMoney(r.valueAg)}</strong>
          </div>
          <div className="bar" aria-hidden="true"><span style={{ width: `${Math.round((r.valueAg / max) * 100)}%` }} /></div>
        </div>
      ))}
    </aside>
  )
}

export function Home() {
  const { dispatch } = useStore()
  const home = useApi(() => api.home())

  if (home.state === 'loading') return <StateView screen="home" mode="loading" />
  if (home.state === 'error') return <StateView screen="home" mode="error" onRetry={home.retry} />
  const d = home.data

  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <header className="head" style={{ alignItems: 'center', gap: 16 }}>
        <div>
          <h1 className="h1">شغل اليوم</h1>
          <div className="sub">{todayText()}</div>
        </div>
        <button type="button" className="btn btn-p" onClick={() => dispatch({ type: 'go', screen: 'batch', batchId: null })}>توليد كروت</button>
      </header>
      {!d.limited && <section aria-label="أرقام اليوم" className="sk-grid">
        <Stat label="كروت انستخدمت اليوم" value={d.usedTodayAg} />
        <Stat label="محصّل اليوم" value={d.collectedTodayAg} />
        <Stat label="مستحق على الموزعين" value={d.owedTotalAg} top />
      </section>}
      <div className="home-cols">
        <section aria-label="المهام" className="tasks">
          <Tasks tasks={d.tasks} />
        </section>
        {!d.limited && <UsageToday rows={d.usageToday} />}
      </div>
    </div>
  )
}
