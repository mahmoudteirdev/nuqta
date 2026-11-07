import { useState } from 'react'
import type { BackupInfo } from '@shared/api'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useApi } from '@/lib/useApi'
import { Dialog } from './Dialog'
import { useToast } from './Toast'

const KIND: Record<BackupInfo['kind'], string> = {
  auto: 'تلقائية',
  manual: 'يدوية',
  'before-restore': 'قبل استرجاع',
  imported: 'من ملف'
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function backupError(code: string): string {
  switch (code) {
    case 'backup_corrupt': return 'النسخة تالفة، ما بنقدر نرجع لها.'
    case 'backup_too_new': return 'النسخة من نسخة برنامج أحدث. حدّث البرنامج أول.'
    case 'backup_not_nuqta': return 'هذا الملف مش نسخة من نُقطة.'
    case 'backup_missing': return 'ما لقينا النسخة.'
    case 'backup_no_db': return 'قاعدة البيانات مش فاتحة، فما بنقدر ناخذ نسخة. بتقدر تسترجع نسخة قديمة.'
    default: return 'صار خطأ، جرّب مرة ثانية.'
  }
}

/** قائمة النسخ والاسترجاع. نفسها بالإعدادات وبشاشة قاعدة البيانات التالفة. */
export function RestoreList({ compact }: { compact?: boolean }) {
  const say = useToast()
  const [n, setN] = useState(0)
  const list = useApi(() => api.backups(), [n])
  const [target, setTarget] = useState<BackupInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const items = list.state === 'ready' ? list.data.items : []
  const shown = compact ? items.slice(0, 5) : items

  return (
    <div className="restore">
      {list.state === 'ready' && !items.length && <span className="sub">ما في نسخ على هالجهاز لسا.</span>}
      {shown.map((b) => (
        <div key={b.file} className="restore-row">
          <div><strong>{when(b.at)}</strong> <span className="sub small">{KIND[b.kind]} · {size(b.size)}</span></div>
          <button type="button" className="btn btn-d sm" onClick={() => { setErr(''); setTarget(b) }}>استرجع</button>
        </div>
      ))}
      <button type="button" className="btn btn-s" style={{ alignSelf: 'flex-start' }} onClick={async () => {
        const r = await api.restoreFromFile()
        if (!r.ok) return say(backupError(r.error.code))
        if ('restarting' in r.value) say('رجعنا للنسخة. البرنامج بيعيد التشغيل.')
        else setN((x) => x + 1)
      }}>استرجع من ملف</button>
      {target && (
        <Dialog title={t('dlg.restore.title', { when: when(target.at) })} body={t('dlg.restore.body')} okLabel="استرجع" danger
          busy={busy} busyLabel="جاري الاسترجاع" error={err} onCancel={() => setTarget(null)}
          onOk={async () => {
            setBusy(true)
            const r = await api.restoreBackup(target.file)
            if (!r.ok) {
              setBusy(false)
              return setErr(backupError(r.error.code))
            }
            say('رجعنا للنسخة. البرنامج بيعيد التشغيل.')
          }} />
      )}
    </div>
  )
}

export function BackupTab() {
  const say = useToast()
  const [n, setN] = useState(0)
  const list = useApi(() => api.backups(), [n])
  const [busy, setBusy] = useState(false)
  const last = list.state === 'ready' ? list.data.items[0] : undefined

  return (
    <section className="scr backup-grid" aria-label="النسخ والاستعادة">
      <div className="card backup-card">
        <h2 className="h2">نسخة على هذا الجهاز</h2>
        <div>آخر نسخة: <strong>{last ? when(last.at) : 'ما في لسا'}</strong></div>
        <span className="sub small">البرنامج بياخذ نسخة تلقائية كل يوم، وبيحتفظ بآخر 30. النسخ اليدوية ما بتنحذف.</span>
        <div className="row-btns">
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => {
            setBusy(true)
            void api.backupNow().then((r) => {
              setBusy(false)
              if (!r.ok) return say(backupError(r.error.code))
              say('انأخذت نسخة.')
              setN((x) => x + 1)
            })
          }}>
            {busy && <span className="spin" aria-hidden="true" />}
            {busy ? 'جاري النسخ' : 'خذ نسخة الآن'}
          </button>
          <button type="button" className="btn btn-s" onClick={async () => {
            const r = await api.saveBackupAs()
            if (!r.ok) return say(backupError(r.error.code))
            if ('path' in r.value) say('انحفظت النسخة.')
          }}>احفظ نسخة بمكان ثاني</button>
        </div>
        <span className="sub small">ما في نسخ سحابي لسا. احفظ نسخة على فلاشة من وقت لوقت.</span>
      </div>
      <div className="card backup-card">
        <h2 className="h2">استرجاع نسخة</h2>
        <p style={{ margin: 0 }}>الاسترجاع بيرجع كل الحسابات لتاريخ النسخة. الحركات الأحدث منها بتروح، بس بناخذ نسخة من الوضع الحالي قبل.</p>
        <RestoreList key={n} />
      </div>
    </section>
  )
}
