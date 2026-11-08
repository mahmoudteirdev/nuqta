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
import { UpdatesTab } from '@/shell/UpdatesTab'
import { UsersTab } from '@/shell/UsersTab'
import { Tabs } from '@/shell/Tabs'
import { useToast } from '@/shell/Toast'

type Tab = 'net' | 'users' | 'rules' | 'backup' | 'import' | 'license' | 'updates'
const TAB_DEFS: { key: Tab; nameKey: string }[] = [
  { key: 'net', nameKey: 'settings.tabNet' },
  { key: 'users', nameKey: 'settings.tabUsers' },
  { key: 'rules', nameKey: 'settings.tabRules' },
  { key: 'backup', nameKey: 'settings.tabBackup' },
  { key: 'import', nameKey: 'settings.tabImport' },
  { key: 'license', nameKey: 'settings.tabLicense' },
  { key: 'updates', nameKey: 'settings.tabUpdates' }
]

const ROLE: Record<UserRole, { name: string; note: string }> = {
  owner: { name: 'مدير', note: 'كل الصلاحيات' },
  technician: { name: 'فني', note: 'الراوتر والكروت' }
}

function NetTab() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const saved = useApi(() => api.networkSettings())
  const [s, setS] = useState<NetworkSettings | null>(null)
  const [err, setErr] = useState<{ field: 'name' | 'phone'; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (saved.state === 'ready' && !s) setS(saved.data) }, [saved, s])
  if (!s) return <div className="card"><span className="sk" style={{ width: '50%' }} /></div>

  return (
    <section className="card scr settings-form" aria-label={isEn ? 'Network details' : 'بيانات الشبكة'}>
      <div className="fld">
        <label className="lbl" htmlFor="langSel">{t('settings.language')}</label>
        <div className="box">
          <select id="langSel" value={state.lang} onChange={(e) => dispatch({ type: 'setLang', lang: e.target.value as 'ar' | 'en' })}>
            <option value="ar">{t('settings.langAr')}</option>
            <option value="en">{t('settings.langEn')}</option>
          </select>
        </div>
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="sn">{t('settings.netName')}</label>
        <div className={err?.field === 'name' ? 'box err' : 'box'}>
          <input id="sn" value={s.networkName} aria-invalid={err?.field === 'name'} aria-describedby={err?.field === 'name' ? 'snE' : undefined}
            onChange={(e) => { const v = e.target.value; setS((p) => p && { ...p, networkName: v }); setErr(null) }} />
        </div>
        {err?.field === 'name' && <span id="snE" className="emsg" role="alert">{err.msg}</span>}
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="sp">{t('settings.supportPhone')}</label>
        <div className={err?.field === 'phone' ? 'box err' : 'box'} dir="ltr">
          <input id="sp" inputMode="tel" value={s.phone} placeholder="059" aria-invalid={err?.field === 'phone'} aria-describedby={err?.field === 'phone' ? 'spE' : 'spH'}
            onChange={(e) => { const v = e.target.value; setS((p) => p && { ...p, phone: v }); setErr(null) }} />
        </div>
        {err?.field === 'phone' ? <span id="spE" className="emsg" role="alert">{err.msg}</span> : <span id="spH" className="sub small">{state.lang === 'en' ? 'Optional. If left blank, omitted from cards.' : 'اختياري. إذا فاضي ما بيطلع على الكرت.'}</span>}
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="sc">{state.lang === 'en' ? 'Currency' : 'العملة'}</label>
        <div className="box"><select id="sc" disabled aria-describedby="scH"><option>{t('common.shekel')}</option></select></div>
        <span id="scH" className="sub small">{state.lang === 'en' ? 'Transactions are in Shekels only for now.' : 'الحساب بالشيكل بس لهلأ.'}</span>
      </div>
      <button type="button" className="btn btn-p" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
        if (!s.networkName.trim()) return setErr({ field: 'name', msg: state.lang === 'en' ? 'Enter network name.' : 'اكتب اسم الشبكة.' })
        setBusy(true)
        const r = await api.saveNetworkSettings(s)
        setBusy(false)
        if (!r.ok) return setErr(r.error.code === 'phone_invalid' ? { field: 'phone', msg: state.lang === 'en' ? 'Phone contains letters. Use numbers only.' : 'الرقم فيه أحرف. اكتب أرقام بس.' } : { field: 'name', msg: errorText(r.error) })
        say(t('settings.saved'))
        dispatch({ type: 'status', status: await api.status() })
      }}>
        {busy && <span className="spin" aria-hidden="true" />}
        {busy ? t('common.loading') : t('settings.save')}
      </button>
    </section>
  )
}

function getRuleFields(isEn: boolean): { key: keyof Rules; label: string; hint: string; money?: boolean }[] {
  if (isEn) {
    return [
      { key: 'collectAfterDays', label: 'Collection task after', hint: 'days from last settlement, if balance remains.' },
      { key: 'stockLowCards', label: 'Low stock warning below', hint: 'cards of a category held by distributor.' },
      { key: 'staleAfterDays', label: 'Card considered stale after', hint: 'days from delivery without use.' },
      { key: 'defaultCreditLimitAg', label: 'Default credit limit for new distributor', hint: 'Customizable per distributor in their account.', money: true },
      { key: 'maxBatchCount', label: 'Maximum batch size', hint: 'cards. Batches over 1,000 should be tested on real hardware.' }
    ]
  }
  return [
    { key: 'collectAfterDays', label: 'مهمة التحصيل بعد', hint: 'يوم من آخر تسوية، إذا لسا عليه.' },
    { key: 'stockLowCards', label: 'تنبيه المخزون تحت', hint: 'كرت من فئة مع الموزع.' },
    { key: 'staleAfterDays', label: 'الكرت راكد بعد', hint: 'يوم من التسليم بدون استخدام.' },
    { key: 'defaultCreditLimitAg', label: 'سقف الدين للموزع الجديد', hint: 'بيتغير لكل موزع من حسابه.', money: true },
    { key: 'maxBatchCount', label: 'أكبر دفعة', hint: 'كرت. فوق الألف لسا ما انجرب على راوتر حقيقي.' }
  ]
}

function RulesTab() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const saved = useApi(() => api.rules())
  const [v, setV] = useState<Record<keyof Rules, string> | null>(null)
  const [err, setErr] = useState<{ key: keyof Rules; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const ruleFields = getRuleFields(isEn)

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
    <section className="card scr settings-form" aria-label={isEn ? 'Provisional Rules' : 'قواعد مؤقتة'}>
      <p className="sub" style={{ margin: 0 }}>
        {isEn
          ? 'These values are rules to tune network behavior. Changes take effect immediately and do not alter past transactions.'
          : 'هاي القيم مؤقتة لحد ما نجربها مع المستخدمين. التغيير بيأثر من هلأ، وما بيغير حسابات قديمة.'}
      </p>
      {ruleFields.map((f) => {
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
        for (const f of ruleFields) {
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
          const money = ruleFields.find((f) => f.key === key)?.money
          const show = (n: number) => (money ? formatMoney(n) : n.toLocaleString('en-US'))
          return setErr({
            key,
            msg: range
              ? (isEn ? `Must be between ${show(range[0])} and ${show(range[1])}.` : `لازم يكون بين ${show(range[0])} و${show(range[1])}.`)
              : (isEn ? 'Value is out of allowed bounds.' : 'القيمة برا الحدود المسموحة.')
          })
        }
        say(isEn ? 'Rules saved.' : 'انحفظت القواعد.')
        dispatch({ type: 'changed' })
      }}>
        {busy && <span className="spin" aria-hidden="true" />}
        {busy ? (isEn ? 'Saving...' : 'جاري الحفظ') : t('common.save')}
      </button>
    </section>
  )
}

export function Settings() {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const [tab, setTab] = useState<Tab>((TAB_DEFS.find((x) => x.key === state.settingsTab)?.key) ?? 'net')
  const ping = useApi(() => api.networkSettings())
  if (ping.state === 'loading') return <StateView screen="settings" mode="loading" />
  if (ping.state === 'error') return <StateView screen="settings" mode="error" onRetry={ping.retry} />
  return (
    <div className="scr stack" style={{ gap: 20 }}>
      <h1 className="h1">{t('settings.title')}</h1>
      <Tabs label={isEn ? 'Settings Sections' : 'أقسام الإعدادات'} tabs={TAB_DEFS.map((d) => ({ key: d.key, name: t(d.nameKey) }))} current={tab} onChange={setTab}>
        {tab === 'net' && <NetTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'backup' && <BackupTab />}
        {tab === 'import' && <ImportTab />}
        {tab === 'license' && <LicenseTab />}
        {tab === 'updates' && <UpdatesTab />}
      </Tabs>
    </div>
  )
}
