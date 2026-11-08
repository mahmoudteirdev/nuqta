import { useEffect, useState } from 'react'
import type { NetworkSettings, Rules, UserRole } from '@shared/api'
import { parseAgorot } from '@shared/input'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { formatMoney } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from '@/shell/Dialog'
import { StateView } from '@/shell/StateView'
import { BackupTab } from '@/shell/Backups'
import { ImportTab } from '@/shell/ImportTab'
import { LicenseTab } from '@/shell/LicenseTab'
import { UsersTab } from '@/shell/UsersTab'
import { Tabs } from '@/shell/Tabs'
import { useToast } from '@/shell/Toast'

type Tab = 'net' | 'users' | 'rules' | 'backup' | 'import' | 'license'
const TABS: { key: Tab; name: string }[] = [
  { key: 'net', name: 'بيانات الشبكة' },
  { key: 'users', name: 'المستخدمون' },
  { key: 'rules', name: 'قواعد مؤقتة' },
  { key: 'backup', name: 'النسخ والاستعادة' },
  { key: 'import', name: 'الاستيراد' },
  { key: 'license', name: 'الترخيص' }
]

const ROLE: Record<UserRole, { name: string; note: string }> = {
  owner: { name: 'مدير', note: 'كل الصلاحيات' },
  technician: { name: 'فني', note: 'الراوتر والكروت' }
}

function NetTab() {
  const { dispatch } = useStore()
  const say = useToast()
  const saved = useApi(() => api.networkSettings())
  const [s, setS] = useState<NetworkSettings | null>(null)
  const [err, setErr] = useState<{ field: 'name' | 'phone'; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (saved.state === 'ready' && !s) setS(saved.data) }, [saved, s])
  if (!s) return <div className="card"><span className="sk" style={{ width: '50%' }} /></div>

  return (
    <section className="card scr settings-form" aria-label="بيانات الشبكة">
      <div className="fld">
        <label className="lbl" htmlFor="sn">اسم الشبكة على الكرت</label>
        <div className={err?.field === 'name' ? 'box err' : 'box'}>
          <input id="sn" value={s.networkName} aria-invalid={err?.field === 'name'} aria-describedby={err?.field === 'name' ? 'snE' : undefined}
            onChange={(e) => { const v = e.target.value; setS((p) => p && { ...p, networkName: v }); setErr(null) }} />
        </div>
        {err?.field === 'name' && <span id="snE" className="emsg" role="alert">{err.msg}</span>}
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="sp">رقم الدعم على الكرت</label>
        <div className={err?.field === 'phone' ? 'box err' : 'box'} dir="ltr">
          <input id="sp" inputMode="tel" value={s.phone} placeholder="059" aria-invalid={err?.field === 'phone'} aria-describedby={err?.field === 'phone' ? 'spE' : 'spH'}
            onChange={(e) => { const v = e.target.value; setS((p) => p && { ...p, phone: v }); setErr(null) }} />
        </div>
        {err?.field === 'phone' ? <span id="spE" className="emsg" role="alert">{err.msg}</span> : <span id="spH" className="sub small">اختياري. إذا فاضي ما بيطلع على الكرت.</span>}
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="sc">العملة</label>
        <div className="box"><select id="sc" disabled aria-describedby="scH"><option>شيكل ₪</option></select></div>
        <span id="scH" className="sub small">الحساب بالشيكل بس لهلأ.</span>
      </div>
      <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
        if (!s.networkName.trim()) return setErr({ field: 'name', msg: 'اكتب اسم الشبكة.' })
        setBusy(true)
        const r = await api.saveNetworkSettings(s)
        setBusy(false)
        if (!r.ok) return setErr(r.error.code === 'phone_invalid' ? { field: 'phone', msg: 'الرقم فيه أحرف. اكتب أرقام بس.' } : { field: 'name', msg: errorText(r.error) })
        say('انحفظت بيانات الشبكة.')
        dispatch({ type: 'status', status: await api.status() })
      }}>
        {busy && <span className="spin" aria-hidden="true" />}
        {busy ? 'جاري الحفظ' : 'احفظ'}
      </button>
    </section>
  )
}

const RULE_FIELDS: { key: keyof Rules; label: string; hint: string; money?: boolean }[] = [
  { key: 'collectAfterDays', label: 'مهمة التحصيل بعد', hint: 'يوم من آخر تسوية، إذا لسا عليه.' },
  { key: 'stockLowCards', label: 'تنبيه المخزون تحت', hint: 'كرت من فئة مع الموزع.' },
  { key: 'staleAfterDays', label: 'الكرت راكد بعد', hint: 'يوم من التسليم بدون استخدام.' },
  { key: 'defaultCreditLimitAg', label: 'سقف الدين للموزع الجديد', hint: 'بيتغير لكل موزع من حسابه.', money: true },
  { key: 'maxBatchCount', label: 'أكبر دفعة', hint: 'كرت. فوق الألف لسا ما انجرب على راوتر حقيقي.' }
]

function RulesTab() {
  const { dispatch } = useStore()
  const say = useToast()
  const saved = useApi(() => api.rules())
  const [v, setV] = useState<Record<keyof Rules, string> | null>(null)
  const [err, setErr] = useState<{ key: keyof Rules; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (saved.state !== 'ready' || v) return
    const r = saved.data
    setV({
      collectAfterDays: String(r.collectAfterDays), stockLowCards: String(r.stockLowCards), staleAfterDays: String(r.staleAfterDays),
      defaultCreditLimitAg: String(r.defaultCreditLimitAg / 100), maxBatchCount: String(r.maxBatchCount)
    })
  }, [saved, v])
  if (!v) return <div className="card"><span className="sk" style={{ width: '50%' }} /></div>

  return (
    <section className="card scr settings-form" aria-label="قواعد مؤقتة">
      <p className="sub" style={{ margin: 0 }}>هاي القيم مؤقتة لحد ما نجربها مع المستخدمين. التغيير بيأثر من هلأ، وما بيغير حسابات قديمة.</p>
      {RULE_FIELDS.map((f) => {
        const bad = err?.key === f.key
        return (
          <div key={f.key} className="fld">
            <label className="lbl" htmlFor={`r-${f.key}`}>{f.label}</label>
            <div className="rule-row">
              <div className={bad ? 'box err rule-box' : 'box rule-box'} dir="ltr">
                {f.money && <span aria-hidden="true">₪</span>}
                <input id={`r-${f.key}`} inputMode="numeric" value={v[f.key]} aria-invalid={bad} aria-describedby={bad ? `r-${f.key}-e` : `r-${f.key}-h`}
                  onChange={(e) => { const x = e.target.value; setV((p) => p && { ...p, [f.key]: x }); setErr(null) }} />
              </div>
              <span id={`r-${f.key}-h`} className="sub small">{f.hint}</span>
            </div>
            {bad && <span id={`r-${f.key}-e`} className="emsg" role="alert">{err.msg}</span>}
          </div>
        )
      })}
      <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
        const r = {} as Rules
        for (const f of RULE_FIELDS) {
          const n = f.money ? parseAgorot(v[f.key]) : Number(v[f.key].trim())
          if (!Number.isSafeInteger(n)) return setErr({ key: f.key, msg: t('err.count') })
          r[f.key] = n
        }
        setBusy(true)
        const res = await api.saveRules(r)
        setBusy(false)
        if (!res.ok) {
          const key = res.error.code.replace(/^rule_/, '') as keyof Rules
          const range = res.error.range
          const money = RULE_FIELDS.find((f) => f.key === key)?.money
          const show = (n: number) => (money ? formatMoney(n) : n.toLocaleString('en-US'))
          return setErr({ key, msg: range ? `لازم يكون بين ${show(range[0])} و${show(range[1])}.` : 'القيمة برا الحدود المسموحة.' })
        }
        say('انحفظت القواعد.')
        dispatch({ type: 'changed' })
      }}>
        {busy && <span className="spin" aria-hidden="true" />}
        {busy ? 'جاري الحفظ' : 'احفظ'}
      </button>
    </section>
  )
}

export function Settings() {
  const { state } = useStore()
  const [tab, setTab] = useState<Tab>((TABS.find((x) => x.key === state.settingsTab)?.key) ?? 'net')
  const ping = useApi(() => api.networkSettings())
  if (ping.state === 'loading') return <StateView screen="settings" mode="loading" />
  if (ping.state === 'error') return <StateView screen="settings" mode="error" onRetry={ping.retry} />
  return (
    <div className="scr stack" style={{ gap: 20 }}>
      <h1 className="h1">الإعدادات</h1>
      <Tabs label="أقسام الإعدادات" tabs={TABS} current={tab} onChange={setTab}>
        {tab === 'net' && <NetTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'backup' && <BackupTab />}
        {tab === 'import' && <ImportTab />}
        {tab === 'license' && <LicenseTab />}
      </Tabs>
    </div>
  )
}
